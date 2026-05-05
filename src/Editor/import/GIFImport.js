import * as fastgif from './fastgif.js';
import FrameIngest from './FrameIngest';

class GIFImport {
  static importGIFIntoProject (args) {
    let { gifFile, project, onFinish, onProgress, onCancel, onError, onRegisterCancel } = args;

    let a = new FileReader();
    a.onload = (e) => {
      let buf = e.target.result;

      const wasmDecoder = new fastgif.Decoder();
      wasmDecoder.decode(buf).then(decoded => {
        let tempCanvas = document.createElement('canvas');
        let tempCtx = tempCanvas.getContext('2d');

        FrameIngest.importFramesIntoProject({
          project,
          frameCount: decoded.length,
          filenameBase: gifFile.name,
          maxBufferedFrames: 4,
          onProgress,
          onCancel,
          onError,
          onRegisterCancel,
          frameProducer: async (pushFrame, isCancelled) => {
            for (let frameIndex = 0; frameIndex < decoded.length; frameIndex++) {
              if (isCancelled()) return;

              let frame = decoded[frameIndex];
              tempCanvas.width = frame.imageData.width;
              tempCanvas.height = frame.imageData.height;
              tempCtx.putImageData(frame.imageData, 0, 0);

              let frameBlob = await FrameIngest.canvasFrameToBlob(tempCanvas);
              await pushFrame(frameBlob, frameIndex);
            }
          },
          onFinish: (imageAssets) => {
            window.Wick.GIFAsset.fromImages(imageAssets, project, gifAsset => {
              gifAsset.name = gifFile.name;
              gifAsset.filename = gifFile.name;
              onFinish(gifAsset);
            });
          },
        });
      });
    };

    a.readAsArrayBuffer(gifFile);
  }
}

export default GIFImport;
