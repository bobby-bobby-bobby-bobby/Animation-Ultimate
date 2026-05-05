import ClipFromImages from './ClipFromImages';

const DEFAULT_TARGET_FPS = 12;
const IMAGE_ASSET_CHUNK_SIZE = 20;
const MAX_VIDEO_FRAMES = 900;
const MAX_VIDEO_PIXELS = 1920 * 1080 * 2;

const VIDEO_MIME_TYPES = ['video/mp4', 'video/webm'];

class VideoImport {
  static isVideoFile (file) {
    if (!file) return false;

    if (VIDEO_MIME_TYPES.indexOf(file.type) !== -1) return true;

    const lowerName = (file.name || '').toLowerCase();
    return lowerName.endsWith('.mp4') || lowerName.endsWith('.webm');
  }

  static importVideoIntoProject (args) {
    const {
      videoFile,
      project,
      targetFPS = DEFAULT_TARGET_FPS,
      maxFrames = MAX_VIDEO_FRAMES,
      onProgress,
      onWarning,
      onCancel,
      onFinish,
      onError,
      isCancelled,
    } = args;

    if (!VideoImport.isVideoFile(videoFile)) {
      if (onError) onError(new Error('Unsupported video format.'));
      return;
    }

    let objectURL = null;
    let cancelled = false;

    const checkCancelled = () => {
      if (cancelled || (isCancelled && isCancelled())) {
        cancelled = true;
        if (objectURL) URL.revokeObjectURL(objectURL);
        if (onCancel) onCancel();
        throw new Error('VIDEO_IMPORT_CANCELLED');
      }
    };

    const setProgress = (value, detail) => {
      if (onProgress) onProgress(Math.max(0, Math.min(1, value)), detail);
    };

    const cleanup = () => {
      if (objectURL) URL.revokeObjectURL(objectURL);
    };

    const run = async () => {
      objectURL = URL.createObjectURL(videoFile);
      const { video, duration, width, height } = await VideoImport._loadVideoMetadata(objectURL);

      if (width * height > MAX_VIDEO_PIXELS && onWarning) {
        onWarning('Video resolution is very high. Import may take longer than usual.');
      }

      checkCancelled();

      const rawFrameCount = Math.max(1, Math.ceil(duration * targetFPS));
      const sampledFrameCount = Math.min(rawFrameCount, maxFrames);

      if (rawFrameCount > maxFrames && onWarning) {
        onWarning(`Video truncated to ${maxFrames} frames to avoid memory issues.`);
      }

      const sampledFrames = await VideoImport._sampleVideoFrames({
        video,
        duration,
        width,
        height,
        frameCount: sampledFrameCount,
        setProgress,
        checkCancelled,
      });

      const imageAssets = await VideoImport._createImageAssetsFromDataURLs({
        sampledFrames,
        videoFile,
        project,
        setProgress,
        checkCancelled,
      });

      checkCancelled();

      project.loadAssets(() => {
        ClipFromImages.createClipAssetFromImages({
          images: imageAssets,
          project,
          isCancelled: () => cancelled || (isCancelled && isCancelled()),
          onProgress: percent => {
            setProgress(0.85 + (percent * 0.15), 'Building clip');
          },
          onFinish: clipAsset => {
            clipAsset.name = videoFile.name;
            clipAsset.filename = videoFile.name;
            setProgress(1, 'Finished');
            cleanup();
            if (onFinish) onFinish(clipAsset);
          },
          onError: err => {
            cleanup();
            if (onError) onError(err);
          },
        });
      });
    };

    run().catch(err => {
      cleanup();
      if (err && err.message === 'VIDEO_IMPORT_CANCELLED') return;
      if (onError) onError(err);
    });

    return {
      cancel: () => {
        cancelled = true;
      },
    };
  }

  static _loadVideoMetadata (objectURL) {
    return new Promise((resolve, reject) => {
      const video = document.createElement('video');
      video.preload = 'metadata';
      video.muted = true;
      video.playsInline = true;
      video.src = objectURL;

      const clearListeners = () => {
        video.onloadedmetadata = null;
        video.onerror = null;
      };

      video.onloadedmetadata = () => {
        clearListeners();
        resolve({
          video,
          duration: video.duration || 0,
          width: video.videoWidth || 1,
          height: video.videoHeight || 1,
        });
      };

      video.onerror = () => {
        clearListeners();
        reject(new Error('Could not read video metadata.'));
      };
    });
  }

  static _sampleVideoFrames (args) {
    const {
      video,
      duration,
      width,
      height,
      frameCount,
      setProgress,
      checkCancelled,
    } = args;

    return new Promise(async (resolve, reject) => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');

        if (!ctx) {
          reject(new Error('Could not create canvas context for video import.'));
          return;
        }

        const dataURLs = [];

        for (let i = 0; i < frameCount; i++) {
          checkCancelled();
          const ratio = frameCount <= 1 ? 0 : (i / (frameCount - 1));
          const sampleTime = Math.max(0, Math.min(duration - 0.001, ratio * duration));
          await VideoImport._seekVideo(video, sampleTime);
          ctx.drawImage(video, 0, 0, width, height);
          dataURLs.push(canvas.toDataURL('image/png'));

          setProgress(0.05 + ((i + 1) / frameCount) * 0.6, 'Sampling video frames');
        }

        resolve(dataURLs);
      } catch (err) {
        reject(err);
      }
    });
  }

  static _createImageAssetsFromDataURLs (args) {
    const {
      sampledFrames,
      videoFile,
      project,
      setProgress,
      checkCancelled,
    } = args;

    return new Promise((resolve) => {
      const imageAssets = [];
      let currentFrame = 0;

      const processChunk = () => {
        checkCancelled();

        const upper = Math.min(currentFrame + IMAGE_ASSET_CHUNK_SIZE, sampledFrames.length);
        for (let i = currentFrame; i < upper; i++) {
          const imageAsset = new window.Wick.ImageAsset({
            filename: `${videoFile.name}_${i}.png`,
            src: sampledFrames[i],
          });
          project.addAsset(imageAsset);
          imageAssets.push(imageAsset);
        }

        currentFrame = upper;
        setProgress(0.65 + (currentFrame / sampledFrames.length) * 0.2, 'Creating image assets');

        if (currentFrame < sampledFrames.length) {
          setTimeout(processChunk, 0);
        } else {
          resolve(imageAssets);
        }
      };

      processChunk();
    });
  }

  static _seekVideo (video, time) {
    return new Promise((resolve, reject) => {
      const clearListeners = () => {
        video.onseeked = null;
        video.onerror = null;
      };

      video.onseeked = () => {
        clearListeners();
        resolve();
      };

      video.onerror = () => {
        clearListeners();
        reject(new Error('Could not seek video while importing.'));
      };

      video.currentTime = Math.max(0, time);
    });
  }
}

export default VideoImport;
