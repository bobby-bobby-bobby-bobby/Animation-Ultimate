import FrameIngest from './FrameIngest';

class ZIPSequenceImport {
  static importExpandedSequenceIntoProject (args) {
    let {
      sequenceFrames,
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
      frameCount: sequenceFrames.length,
      filenameBase,
      onProgress,
      onCancel,
      onError,
      onRegisterCancel,
      maxBufferedFrames,
      frameProducer: async (pushFrame, isCancelled) => {
        for (let frameIndex = 0; frameIndex < sequenceFrames.length; frameIndex++) {
          if (isCancelled()) return;
          await pushFrame(sequenceFrames[frameIndex], frameIndex);
        }
      },
      onFinish,
    });
  }
}

export default ZIPSequenceImport;
