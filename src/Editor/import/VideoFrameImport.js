import FrameIngest from './FrameIngest';

class VideoFrameImport {
  static importExtractedFramesIntoProject (args) {
    let {
      frames,
      project,
      filenameBase,
      onProgress,
      onCancel,
      onError,
      onRegisterCancel,
      onFinish,
      maxBufferedFrames,
    } = args;

    return FrameIngest.importFramesIntoProject({
      project,
      frameCount: frames.length,
      filenameBase,
      onProgress,
      onCancel,
      onError,
      onRegisterCancel,
      maxBufferedFrames,
      frameProducer: async (pushFrame, isCancelled) => {
        for (let frameIndex = 0; frameIndex < frames.length; frameIndex++) {
          if (isCancelled()) return;
          await pushFrame(frames[frameIndex], frameIndex);
        }
      },
      onFinish,
    });
  }
}

export default VideoFrameImport;
