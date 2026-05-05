class ClipFromImages {
  static createClipAssetFromImages (args) {
    const { images, project, onProgress, isCancelled, onFinish, onError } = args;

    if (!images || images.length === 0) {
      if (onError) onError(new Error('No images were provided to create a clip.'));
      return;
    }

    var clip = new window.Wick.Clip();
    clip.activeFrame.remove();

    var imagesCreatedCount = 0;
    var processNextImage = () => {
      if (isCancelled && isCancelled()) {
        clip.remove();
        return;
      }

      images[imagesCreatedCount].createInstance(imagePath => {
        var frame = new window.Wick.Frame({ start: imagesCreatedCount + 1 });
        frame.addPath(imagePath);
        clip.activeLayer.addFrame(frame);

        imagesCreatedCount++;
        if (onProgress) onProgress(imagesCreatedCount / images.length);

        if (imagesCreatedCount === images.length) {
          window.Wick.ClipAsset.fromClip(clip, project, clipAsset => {
            clip.remove();
            if (onFinish) onFinish(clipAsset);
          });
        } else {
          processNextImage();
        }
      });
    };

    processNextImage();
  }
}

export default ClipFromImages;
