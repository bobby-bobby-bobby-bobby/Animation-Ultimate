describe('Wick.GIFAsset', function() {
    const createTestImages = project => {
        var image1 = new Wick.ImageAsset({
            filename: 'test.png',
            src: TestUtils.TEST_IMG_SRC_PNG
        });
        var image2 = new Wick.ImageAsset({
            filename: 'test.png',
            src: TestUtils.TEST_IMG_SRC_PNG_2
        });
        var image3 = new Wick.ImageAsset({
            filename: 'test.png',
            src: TestUtils.TEST_IMG_SRC_PNG_3
        });

        project.addAsset(image1);
        project.addAsset(image2);
        project.addAsset(image3);

        return [image1, image2, image3];
    };

    const withImportedGIFClip = (project, callback) => {
        var images = createTestImages(project);

        project.loadAssets(() => {
            Wick.GIFAsset.fromImages(images, project, gifAsset => {
                project.addAsset(gifAsset);
                gifAsset.createInstance(instance => {
                    project.activeFrame.addClip(instance);
                    callback(instance, gifAsset);
                }, project);
            });
        });
    };

    describe('#fromImages', function () {
        it('should create a ClipAsset with given images', function(done) {
            var project = new Wick.Project();

            withImportedGIFClip(project, instance => {
                expect(instance instanceof Wick.Clip).to.equal(true);

                var layer = instance.timeline.layers[0];
                expect(layer.frames.length).to.equal(3);
                expect(instance.timeline.length).to.equal(3);

                var frame1 = layer.getFrameAtPlayheadPosition(1);
                var frame2 = layer.getFrameAtPlayheadPosition(2);
                var frame3 = layer.getFrameAtPlayheadPosition(3);

                expect(frame1).to.not.equal(frame2);
                expect(frame2).to.not.equal(frame3);
                expect(frame1).to.not.equal(frame3);

                expect(frame1.start).to.equal(1);
                expect(frame1.end).to.equal(1);
                expect(frame2.start).to.equal(2);
                expect(frame2.end).to.equal(2);
                expect(frame3.start).to.equal(3);
                expect(frame3.end).to.equal(3);

                expect(frame1.paths.length).to.equal(1);
                expect(frame2.paths.length).to.equal(1);
                expect(frame3.paths.length).to.equal(1);

                expect(frame1.paths[0].json[1].source).to.equal(TestUtils.TEST_IMG_SRC_PNG);
                expect(frame2.paths[0].json[1].source).to.equal(TestUtils.TEST_IMG_SRC_PNG_2);
                expect(frame3.paths[0].json[1].source).to.equal(TestUtils.TEST_IMG_SRC_PNG_3);

                expect(frame1.paths[0].bounds.width).to.equal(100);
                expect(frame1.paths[0].bounds.height).to.equal(100);
                expect(frame2.paths[0].bounds.width).to.equal(100);
                expect(frame2.paths[0].bounds.height).to.equal(100);
                expect(frame3.paths[0].bounds.width).to.equal(100);
                expect(frame3.paths[0].bounds.height).to.equal(100);

                done();
            });
        });

        it('should scrub imported sequence clips one frame per playhead position', function(done) {
            var project = new Wick.Project();

            withImportedGIFClip(project, instance => {
                var clipTimeline = instance.timeline;
                var layer = clipTimeline.layers[0];

                clipTimeline.playheadPosition = 1;
                expect(layer.activeFrame.paths[0].json[1].source).to.equal(TestUtils.TEST_IMG_SRC_PNG);

                clipTimeline.playheadPosition = 2;
                expect(layer.activeFrame.paths[0].json[1].source).to.equal(TestUtils.TEST_IMG_SRC_PNG_2);

                clipTimeline.playheadPosition = 3;
                expect(layer.activeFrame.paths[0].json[1].source).to.equal(TestUtils.TEST_IMG_SRC_PNG_3);

                done();
            });
        });

        it('should include neighboring imported frames in onion skinning', function(done) {
            var project = new Wick.Project();

            withImportedGIFClip(project, instance => {
                var clipTimeline = instance.timeline;
                var layer = clipTimeline.layers[0];

                project.focus = instance;
                project.onionSkinEnabled = true;
                project.onionSkinSeekBackwards = 1;
                project.onionSkinSeekForwards = 1;

                clipTimeline.playheadPosition = 2;

                expect(layer.frames[0].onionSkinned).to.equal(true);
                expect(layer.frames[1].onionSkinned).to.equal(false);
                expect(layer.frames[2].onionSkinned).to.equal(true);

                done();
            });
        });

        it('should export image sequences for imported clips', function(done) {
            var project = new Wick.Project();

            withImportedGIFClip(project, instance => {
                project.focus = instance;

                Wick.ImageSequence.toPNGSequence({
                    project: project,
                    onFinish: file => {
                        expect(file).to.exist;
                        done();
                    },
                });
            });
        });
    });

    describe('#removeAsset', function () {
        it('should remove ImageAssets that are part of the GIFAsset on deletion of the GIFAsset', function(done) {
            var project = new Wick.Project();
            var images = createTestImages(project);

            project.loadAssets(() => {
                Wick.GIFAsset.fromImages(images, project, gifAsset => {
                    project.addAsset(gifAsset);
                    project.removeAsset(gifAsset);
                    expect(project.assets.length).to.equal(3);
                    done();
                });
            });
        });
    });
});
