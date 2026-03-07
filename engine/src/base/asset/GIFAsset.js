/*
 * Copyright 2020 WICKLETS LLC
 *
 * This file is part of Wick Engine.
 *
 * Wick Engine is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * Wick Engine is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with Wick Engine.  If not, see <https://www.gnu.org/licenses/>.
 */

Wick.GIFAsset = class extends Wick.ClipAsset {
    /**
     * Returns all valid MIME types for files which can be converted to GIFAssets.
     * @return {string[]} Array of strings of MIME types in the form MediaType/Subtype.
     */
    static getValidMIMETypes () {
        return ['image/gif'];
    }

    /**
     * Returns all valid extensions types for files which can be attempted to be
     * converted to GIFAssets.
     * @return  {string[]} Array of strings representing extensions.
     */
    static getValidExtensions () {
        return ['.gif']
    }

    /**
     * Create a new GIFAsset from a series of images.
     * @param {Wick.ImageAsset} images - The ImageAssets, in order of where they will appear in the timeline, which are used to create a ClipAsset
     * @param {function} callback - Fuction to be called when the asset is done being created
     */
    static fromImages (images, project, callback, options) {
        if (!options) options = {};

        var fps = options.fps || project.framerate || 12;
        var frameLength = Math.max(1, Math.round((project.framerate || fps) / fps));
        var onProgress = options.onProgress;

        var clip = new Wick.Clip();
        clip.activeFrame.remove();

        var imagesCreatedCount = 0;
        var processNextImage = () => {
            images[imagesCreatedCount].createInstance(imagePath => {
                // Create a frame for every image
                var frameStart = (imagesCreatedCount * frameLength) + 1;
                var frame = new Wick.Frame({
                    start: frameStart,
                    end: frameStart + frameLength - 1,
                });
                frame.addPath(imagePath);
                clip.activeLayer.addFrame(frame);

                if (onProgress) {
                    onProgress(((imagesCreatedCount + 1) / images.length) * 100);
                }

                // Check if all images have been created
                imagesCreatedCount++;
                if(imagesCreatedCount === images.length) {
                    Wick.GIFAsset.fromClip(clip, project, gifAsset => {
                        // Store import metadata so it persists on save/load
                        gifAsset.sequenceImportMeta = {
                            fps: fps,
                            frameLength: frameLength,
                        };

                        // Attach a reference to the resulting clip to all images
                        images.forEach(image => {
                            image.gifAssetUUID = clip.uuid;
                        });

                        clip.remove();
                        callback(gifAsset);
                    });
                } else {
                    processNextImage();
                }
            });
        }

        processNextImage();
    }

    /**
     * Create a new GIFAsset.
     * @param {object} args - Asset args, see Wick.Asset constructor
     */
    constructor (args) {
        super(args);

        this.sequenceImportMeta = null;
    }

    _serialize (args) {
        var data = super._serialize(args);
        data.sequenceImportMeta = this.sequenceImportMeta;
        return data;
    }

    _deserialize (data) {
        super._deserialize(data);
        this.sequenceImportMeta = data.sequenceImportMeta || null;
    }

    get classname () {
        return 'GIFAsset';
    }

    /**
     * A list of objects that use this asset as their source.
     * @returns {Wick.Clip[]}
     */
    getInstances () {
        // Inherited from ClipAsset
        return super.getInstances();
    }

    /**
     * Check if there are any objects in the project that use this asset.
     * @returns {boolean}
     */
    hasInstances () {
        // Inherited from ClipAsset
        return super.hasInstances();
    }

    /**
     * Removes all objects using this asset as their source from the project.
     * @returns {boolean}
     */
    removeAllInstances () {
        // Inherited from ClipAsset
        super.removeAllInstances();
    }

    /**
     * Load data in the asset
     */
    load (callback) {
        // We don't need to do anything here, the data for ClipAssets/GIFAssets is just json
        callback();
    }
}
