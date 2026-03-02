class VideoImport {
  static get SUPPORTED_TYPES () {
    return ['video/mp4', 'video/webm'];
  }

  static get MAX_FILE_SIZE_BYTES () {
    return 250 * 1024 * 1024;
  }

  static importVideoIntoProject (args) {
    const {
      videoFile,
      project,
      fps = project.framerate || 12,
      framesPerSlice = 4,
      onProgress,
      onFinish,
      onError,
      isCanceled,
    } = args;

    if (!videoFile || !project) {
      if (onError) onError('Missing video file or project.');
      return;
    }

    if (VideoImport.SUPPORTED_TYPES.indexOf(videoFile.type) === -1) {
      if (onError) onError('Unsupported video file type: ' + (videoFile.type || 'unknown'));
      return;
    }

    if (videoFile.size > VideoImport.MAX_FILE_SIZE_BYTES) {
      if (onError) onError('Video is too large to import. Please use a smaller file.');
      return;
    }

    const objectURL = URL.createObjectURL(videoFile);
    const video = document.createElement('video');
    video.preload = 'auto';
    video.muted = true;
    video.playsInline = true;
    video.crossOrigin = 'anonymous';
    video.style.position = 'fixed';
    video.style.opacity = '0';
    video.style.pointerEvents = 'none';
    video.style.width = '1px';
    video.style.height = '1px';

    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d', { willReadFrequently: true });

    if (!context) {
      if (onError) onError('Could not create canvas context for video import.');
      URL.revokeObjectURL(objectURL);
      return;
    }

    const cleanup = () => {
      video.pause();
      video.removeAttribute('src');
      video.load();
      if (video.parentNode) {
        video.parentNode.removeChild(video);
      }
      URL.revokeObjectURL(objectURL);
    };

    const fail = (message) => {
      cleanup();
      if (onError) onError(message);
    };

    const waitForEvent = (eventName, timeoutMs = 10000) => {
      return new Promise((resolve, reject) => {
        let timeoutID = null;

        const clear = () => {
          if (timeoutID) clearTimeout(timeoutID);
          video.removeEventListener(eventName, onEvent);
          video.removeEventListener('error', onErrorEvent);
        };

        const onEvent = () => {
          clear();
          resolve();
        };

        const onErrorEvent = () => {
          clear();
          reject(new Error('Video decode failed while waiting for ' + eventName));
        };

        timeoutID = setTimeout(() => {
          clear();
          reject(new Error('Timed out waiting for ' + eventName));
        }, timeoutMs);

        video.addEventListener(eventName, onEvent, { once: true });
        video.addEventListener('error', onErrorEvent, { once: true });
      });
    };

    const seekTo = (time) => {
      return new Promise((resolve, reject) => {
        let done = false;
        let timeoutID = null;

        const clear = () => {
          if (timeoutID) clearTimeout(timeoutID);
          video.removeEventListener('seeked', onSeeked);
          video.removeEventListener('error', onVideoError);
        };

        const onSeeked = () => {
          if (done) return;
          done = true;
          clear();
          resolve();
        };

        const onVideoError = () => {
          if (done) return;
          done = true;
          clear();
          reject(new Error('Video seek/decode error at ' + time.toFixed(3) + 's'));
        };

        timeoutID = setTimeout(() => {
          if (done) return;
          done = true;
          clear();
          reject(new Error('Video seek timeout at ' + time.toFixed(3) + 's'));
        }, 10000);

        video.addEventListener('seeked', onSeeked);
        video.addEventListener('error', onVideoError, { once: true });
        video.currentTime = time;
      });
    };

    const nextTaskSlice = (fn) => {
      if (window.requestIdleCallback) {
        window.requestIdleCallback(() => fn(), { timeout: 32 });
      } else {
        setTimeout(fn, 0);
      }
    };

    const canUseWorkerOffscreen = () => {
      return typeof Worker !== 'undefined' &&
        typeof OffscreenCanvas !== 'undefined' &&
        typeof createImageBitmap !== 'undefined';
    };

    const extractWithWorker = (times, width, height) => {
      return new Promise((resolve, reject) => {
        const workerSource = `
          self.onmessage = async function (event) {
            if (event.data.type !== 'frame') return;
            const frame = event.data.frame;
            const index = event.data.index;
            const width = event.data.width;
            const height = event.data.height;
            try {
              const canvas = new OffscreenCanvas(width, height);
              const ctx = canvas.getContext('2d');
              ctx.drawImage(frame, 0, 0, width, height);
              frame.close && frame.close();
              const blob = await canvas.convertToBlob({ type: 'image/png' });
              const reader = new FileReaderSync();
              const dataURL = reader.readAsDataURL(blob);
              self.postMessage({ type: 'frameComplete', index: index, dataURL: dataURL });
            } catch (error) {
              self.postMessage({ type: 'frameError', message: error.message || 'Worker decode failed.' });
            }
          };
        `;

        const worker = new Worker(URL.createObjectURL(new Blob([workerSource], { type: 'application/javascript' })));
        const dataURLs = new Array(times.length);
        let frameIndex = 0;
        let completed = 0;
        let failed = false;

        const cleanupWorker = () => {
          worker.terminate();
        };

        worker.onmessage = (event) => {
          if (event.data.type === 'frameComplete') {
            dataURLs[event.data.index] = event.data.dataURL;
            completed += 1;
            if (onProgress) onProgress(completed, times.length, 'Decoding video frames...');
            if (completed === times.length) {
              cleanupWorker();
              resolve(dataURLs);
            } else {
              scheduleSlice();
            }
          } else if (event.data.type === 'frameError') {
            if (failed) return;
            failed = true;
            cleanupWorker();
            reject(new Error(event.data.message));
          }
        };

        worker.onerror = () => {
          if (failed) return;
          failed = true;
          cleanupWorker();
          reject(new Error('Worker frame extraction failed.'));
        };

        const scheduleSlice = () => {
          nextTaskSlice(async () => {
            if (failed) return;
            if (isCanceled && isCanceled()) {
              failed = true;
              cleanupWorker();
              reject(new Error('Video import canceled.'));
              return;
            }

            let processed = 0;
            while (processed < framesPerSlice && frameIndex < times.length) {
              try {
                await seekTo(times[frameIndex]);
                const frameBitmap = await createImageBitmap(video);
                worker.postMessage({
                  type: 'frame',
                  index: frameIndex,
                  frame: frameBitmap,
                  width: width,
                  height: height,
                }, [frameBitmap]);
              } catch (error) {
                failed = true;
                cleanupWorker();
                reject(error);
                return;
              }

              frameIndex += 1;
              processed += 1;
            }
          });
        };

        scheduleSlice();
      });
    };

    const extractBaseline = (times, width, height) => {
      return new Promise((resolve, reject) => {
        const dataURLs = new Array(times.length);
        let frameIndex = 0;

        const processSlice = () => {
          if (isCanceled && isCanceled()) {
            reject(new Error('Video import canceled.'));
            return;
          }

          let processed = 0;

          const processFrame = async () => {
            while (processed < framesPerSlice && frameIndex < times.length) {
              await seekTo(times[frameIndex]);
              context.drawImage(video, 0, 0, width, height);
              dataURLs[frameIndex] = canvas.toDataURL('image/png');
              frameIndex += 1;
              processed += 1;

              if (onProgress) onProgress(frameIndex, times.length, 'Decoding video frames...');
            }

            if (frameIndex >= times.length) {
              resolve(dataURLs);
            } else {
              nextTaskSlice(processSlice);
            }
          };

          processFrame().catch(reject);
        };

        processSlice();
      });
    };

    const importFromDataURLs = (dataURLs) => {
      const imageAssets = [];
      dataURLs.forEach((dataURL, index) => {
        const imageAsset = new window.Wick.ImageAsset({
          filename: videoFile.name + '_' + index + '.png',
          src: dataURL,
        });
        project.addAsset(imageAsset);
        imageAssets.push(imageAsset);
      });

      project.loadAssets(() => {
        window.Wick.GIFAsset.fromImages(imageAssets, project, (clipAsset) => {
          clipAsset.name = videoFile.name;
          clipAsset.filename = videoFile.name;
          if (onFinish) onFinish(clipAsset);
        });
      });
    };

    const runImport = async () => {
      try {
        document.body.appendChild(video);
        video.src = objectURL;
        await waitForEvent('loadedmetadata', 15000);
        await waitForEvent('loadeddata', 15000);

        if (!isFinite(video.duration) || video.duration <= 0) {
          throw new Error('Could not determine video duration.');
        }

        const width = video.videoWidth || 1;
        const height = video.videoHeight || 1;
        canvas.width = width;
        canvas.height = height;

        const frameCount = Math.max(1, Math.floor(video.duration * fps));
        const times = new Array(frameCount).fill(0).map((_, i) => {
          return Math.min(video.duration, i / fps);
        });

        if (onProgress) onProgress(0, frameCount, 'Preparing video import...');

        let dataURLs;
        if (canUseWorkerOffscreen()) {
          dataURLs = await extractWithWorker(times, width, height);
        } else {
          dataURLs = await extractBaseline(times, width, height);
        }

        importFromDataURLs(dataURLs);
        cleanup();
      } catch (error) {
        fail(error.message || 'Video import failed. Unsupported codec or decode error.');
      }
    };

    runImport();
  }
}

export default VideoImport;
