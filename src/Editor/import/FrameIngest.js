const DEFAULT_MAX_BUFFERED_FRAMES = 4;

const canvasToBlob = (canvas, type = 'image/png', quality) => {
  return new Promise((resolve, reject) => {
    canvas.toBlob(blob => {
      if (!blob) {
        reject(new Error('Failed to convert frame canvas to blob.'));
        return;
      }
      resolve(blob);
    }, type, quality);
  });
};

const blobToDataURL = (blob) => {
  return new Promise((resolve, reject) => {
    let reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error || new Error('Failed to read blob.'));
    reader.readAsDataURL(blob);
  });
};

const createBoundedQueue = (maxSize) => {
  const queue = [];
  const waitingConsumers = [];
  const waitingProducers = [];
  let closed = false;

  const flushProducerWaiters = () => {
    while (waitingProducers.length > 0 && queue.length < maxSize) {
      const next = waitingProducers.shift();
      next();
    }
  };

  return {
    async enqueue(item) {
      if (closed) return;
      while (!closed && queue.length >= maxSize) {
        await new Promise(resolve => waitingProducers.push(resolve));
      }
      if (closed) return;

      if (waitingConsumers.length > 0) {
        const consume = waitingConsumers.shift();
        consume(item);
        return;
      }

      queue.push(item);
    },
    async dequeue() {
      if (queue.length > 0) {
        const item = queue.shift();
        flushProducerWaiters();
        return item;
      }

      if (closed) return null;

      return new Promise(resolve => {
        waitingConsumers.push(item => {
          flushProducerWaiters();
          resolve(item);
        });
      });
    },
    close() {
      if (closed) return;
      closed = true;
      while (waitingConsumers.length > 0) {
        const consume = waitingConsumers.shift();
        consume(null);
      }
      while (waitingProducers.length > 0) {
        const produce = waitingProducers.shift();
        produce();
      }
    },
  };
};

class FrameIngest {
  static importFramesIntoProject(args) {
    let {
      project,
      frameCount,
      filenameBase,
      frameProducer,
      maxBufferedFrames = DEFAULT_MAX_BUFFERED_FRAMES,
      onProgress,
      onCancel,
      onFinish,
      onError,
    } = args;

    let cancelled = false;
    let importedCount = 0;
    let imageAssets = [];
    let queue = createBoundedQueue(Math.max(1, maxBufferedFrames));

    let cancel = () => {
      cancelled = true;
      queue.close();
      if (onCancel) onCancel();
    };

    if (args.onRegisterCancel) {
      args.onRegisterCancel(cancel);
    }

    let notifyProgress = (message) => {
      if (!onProgress) return;
      if (frameCount && frameCount > 0) {
        onProgress(message, importedCount / frameCount);
      } else {
        onProgress(message, null);
      }
    };

    let producer = async () => {
      try {
        await frameProducer(async (blob, frameIndex) => {
          if (cancelled) return;
          await queue.enqueue({ blob, frameIndex });
        }, () => cancelled);
      } catch (error) {
        if (!cancelled && onError) onError(error);
      } finally {
        queue.close();
      }
    };

    let consumer = async () => {
      while (!cancelled) {
        let nextFrame = await queue.dequeue();
        if (!nextFrame) break;

        let dataURL = await blobToDataURL(nextFrame.blob);
        let imageAsset = new window.Wick.ImageAsset({
          filename: `${filenameBase}_${nextFrame.frameIndex}.png`,
          src: dataURL,
        });

        project.addAsset(imageAsset);
        imageAssets.push(imageAsset);

        importedCount += 1;
        notifyProgress(`Imported frame ${importedCount}${frameCount ? '/' + frameCount : ''}`);
      }

      if (cancelled) return;

      project.loadAssets(() => {
        if (onFinish) onFinish(imageAssets);
      });
    };

    Promise.all([producer(), consumer()]).catch(error => {
      if (!cancelled && onError) onError(error);
    });

    return { cancel };
  }

  static async canvasFrameToBlob(canvas, type = 'image/png', quality) {
    return canvasToBlob(canvas, type, quality);
  }
}

export default FrameIngest;
