import * as fastgif from './fastgif.js';

class GIFImport {
  static importGIFIntoProject (args) {
    let { gifFile, project, onProgress, onFinish } = args;

    var a = new FileReader();
    a.onload = (e) => {
      var buf = e.target.result;

      var dataURLs = [];

      const wasmDecoder = new fastgif.Decoder();
      if (onProgress) onProgress(15);

      wasmDecoder.decode(buf).then(decoded => {
        var tempCanvas = document.createElement('canvas');
        var tempCtx = tempCanvas.getContext('2d');
        decoded.forEach((frame, index) => {
          tempCanvas.width = frame.imageData.width;
          tempCanvas.height = frame.imageData.height;
          tempCtx.putImageData(frame.imageData, 0, 0);
          dataURLs.push(tempCanvas.toDataURL());
          if (onProgress) onProgress(15 + (35 * ((index + 1) / decoded.length)));
        });

        var imageAssets = [];
        dataURLs.forEach((dataURL, index) => {
            var imageAsset = new window.Wick.ImageAsset({
                filename: gifFile.name + '_' + index + '.png',
                src: dataURL,
            });
            project.addAsset(imageAsset);
            imageAssets.push(imageAsset);
            if (onProgress) onProgress(50 + (25 * ((index + 1) / dataURLs.length)));
        });
        project.loadAssets(() => {
            window.Wick.GIFAsset.fromImages(imageAssets, project, gifAsset => {
                gifAsset.name = gifFile.name;
                gifAsset.filename = gifFile.name;
                if (onProgress) onProgress(100);
                onFinish(gifAsset);
            }, {
                onProgress: (percent) => {
                    if (onProgress) onProgress(75 + (25 * (percent / 100)));
                }
            });
        })
      });
    }
    a.readAsArrayBuffer(gifFile);
  }
}

export default GIFImport;
