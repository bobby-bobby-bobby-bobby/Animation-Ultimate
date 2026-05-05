class ImageSequenceImport {
  static IMAGE_MIME_PREFIX = 'image/';

  static importImageSequenceIntoProject (args) {
    let {
      files,
      extractedFiles,
      project,
      fps,
      onProgress,
      onFinish,
      onError,
    } = args;

    let allFiles = [...(files || []), ...(extractedFiles || [])];
    let groups = ImageSequenceImport.detectSequenceGroups(allFiles);

    if (groups.length === 0) {
      if (onError) onError('No image sequence groups were detected.');
      return;
    }

    let importedAssets = [];
    let totalGroups = groups.length;
    let importNextGroup = (groupIndex) => {
      if (groupIndex >= totalGroups) {
        if (onFinish) onFinish(importedAssets);
        return;
      }

      let group = groups[groupIndex];
      let prefix = `Group ${groupIndex + 1}/${totalGroups}`;
      if (onProgress) onProgress(`${prefix}: Reading ${group.files.length} files`, ((groupIndex / totalGroups) * 100));

      ImageSequenceImport._createImageAssetsFromFiles(group.files, project, {
        onProgress: (message, progress) => {
          if (onProgress) {
            let normalizedProgress = ((groupIndex + (progress / 100)) / totalGroups) * 100;
            onProgress(`${prefix}: ${message}`, normalizedProgress);
          }
        },
        onError,
        onFinish: (imageAssets) => {
          window.Wick.GIFAsset.fromImages(imageAssets, project, clipAsset => {
            clipAsset.name = group.groupName;
            clipAsset.filename = group.groupName;
            clipAsset.sequenceImportMeta = {
              source: 'image-sequence',
              fps,
              tokenPrefix: group.prefix,
              extension: group.extension,
              frameCount: group.files.length,
              filenames: group.files.map(file => file.name),
            };

            importedAssets.push(clipAsset);
            if (onProgress) onProgress(`${prefix}: Complete`, (((groupIndex + 1) / totalGroups) * 100));
            importNextGroup(groupIndex + 1);
          }, {
            fps,
            onProgress: (progress) => {
              if (onProgress) {
                let normalizedProgress = ((groupIndex + (progress / 100)) / totalGroups) * 100;
                onProgress(`${prefix}: Building clip`, normalizedProgress);
              }
            }
          });
        },
      });
    };

    importNextGroup(0);
  }

  static detectSequenceGroups (files, minimumFrames = 2) {
    let candidates = (files || []).map((file, index) => {
      if (!ImageSequenceImport._isLikelyImage(file)) return null;

      let tokenData = ImageSequenceImport._tokenizeFilename(file.name);
      if (!tokenData) return null;

      return {
        index,
        file,
        ...tokenData,
      };
    }).filter(Boolean);

    let grouped = new Map();
    candidates.forEach(candidate => {
      let key = `${candidate.prefix.toLowerCase()}|${candidate.extension.toLowerCase()}|${candidate.digitCount}`;
      if (!grouped.has(key)) grouped.set(key, []);
      grouped.get(key).push(candidate);
    });

    let groups = [];
    grouped.forEach(groupCandidates => {
      if (groupCandidates.length < minimumFrames) return;

      let sorted = groupCandidates
        .slice()
        .sort((a, b) => {
          if (a.frameNumber !== b.frameNumber) return a.frameNumber - b.frameNumber;
          let nameCompare = a.file.name.localeCompare(b.file.name);
          if (nameCompare !== 0) return nameCompare;
          return a.index - b.index;
        });

      groups.push({
        prefix: groupCandidates[0].prefix,
        extension: groupCandidates[0].extension,
        groupName: `${groupCandidates[0].prefix || 'sequence'}.${groupCandidates[0].extension}`,
        files: sorted.map(item => item.file),
      });
    });

    return groups.sort((a, b) => a.groupName.localeCompare(b.groupName));
  }

  static _createImageAssetsFromFiles (files, project, args) {
    let { onProgress, onFinish, onError } = args;

    let imageAssets = [];
    let current = 0;
    let readNext = () => {
      if (current >= files.length) {
        project.loadAssets(() => onFinish(imageAssets));
        return;
      }

      let file = files[current];
      let reader = new FileReader();
      reader.onload = (event) => {
        let imageAsset = new window.Wick.ImageAsset({
          filename: file.name,
          src: event.target.result,
        });
        project.addAsset(imageAsset);
        imageAssets.push(imageAsset);
        current += 1;

        if (onProgress) {
          onProgress(`Loaded frame ${current}/${files.length}`, (current / files.length) * 100);
        }

        readNext();
      };

      reader.onerror = () => {
        if (onError) onError(`Failed to read ${file.name}`);
      };

      reader.readAsDataURL(file);
    };

    readNext();
  }

  static _isLikelyImage (file) {
    if (!file || !file.name) return false;
    if (file.type && file.type.startsWith(ImageSequenceImport.IMAGE_MIME_PREFIX)) {
      return file.type !== 'image/gif';
    }
    return /\.(png|jpg|jpeg|webp|bmp|tiff|tif)$/i.test(file.name);
  }

  static _tokenizeFilename (filename) {
    let extensionMatch = filename.match(/\.([^.]+)$/);
    if (!extensionMatch) return null;

    let extension = extensionMatch[1];
    let basename = filename.slice(0, -(extension.length + 1));
    let numericSuffixMatch = basename.match(/^(.*?)(\d+)$/);
    if (!numericSuffixMatch) return null;

    let prefix = numericSuffixMatch[1].replace(/[\s._-]+$/g, '');
    let numericToken = numericSuffixMatch[2];

    if (!prefix) return null;

    return {
      extension,
      prefix,
      frameNumber: Number(numericToken),
      digitCount: numericToken.length,
    };
  }
}

export default ImageSequenceImport;
