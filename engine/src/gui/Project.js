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

/**
 * The Project GUIElement handles the creation of the canvas and drawing the rest of the GUIElements.
 */
Wick.GUIElement.Project = class extends Wick.GUIElement {
    /**
     * Create a new GUIElement and build the canvas.
     */
    constructor (model) {
        super(model);

        this._canvas = document.createElement('canvas');
        this._ctx = this._canvas.getContext('2d');

        this._canvasContainer = document.createElement('div');
        this._canvasContainer.style.width = "100%";
        this._canvasContainer.style.height = "100%";
        this._canvasContainer.appendChild(this._canvas);

        this._drawnElements = [];

        this._mouse = {x: 0, y: 0};
        this._mouseHoverTargets = [];

        this._scrollX = 0;
        this._scrollY = 0;

        this._popupMenu = null;

        this._onProjectModified = () => {};
        this._onProjectSoftModified = () => {};

        this._attachedDocumentEvents = [];
        this._attachedCanvasEvents = [];

        this._drawRequest = null;
        this._dirtySections = new Set();
        this._lastTooltipRect = null;

    }

    /**
     * Create an event on the document. Saves a reference to the event internally.
     */
    createDocumentEvent (event, callback, c) {
        document.addEventListener(event, callback, c);

        this._attachedDocumentEvents.push({
            event,
            fn: callback,
        });
    }

    /**
     * Create an event on the canvas. Saves a reference to the event internally.
     */
    createCanvasEvent (event, callback, c) {
        this._canvas.addEventListener(event, callback, c);

        this._attachedCanvasEvents.push({
            event,
            fn: callback,
        });
    }


    /**
     * Removes all events from the document and canvas.
     */
    removeAllEventListeners () {
        this._attachedDocumentEvents.forEach((evt) => {
            document.removeEventListener(evt.event, evt.fn);
        }); 

        this._attachedCanvasEvents.forEach((evt) => {
            this._canvas.removeEventListener(evt.event, evt.fn);
        });
    }

    /**
     * The div containing the GUI canvas
     */
    get canvasContainer () {
        return this._canvasContainer;
    }

    set canvasContainer (canvasContainer) {
        this._canvasContainer = canvasContainer;

        if(this._canvas !== this._canvasContainer.children[0]) {
            this._canvasContainer.innerHTML = '';
            this._canvasContainer.appendChild(this._canvas);
        }

        if(!this._mouseEventsAttached) {
            // Mouse events
            // (Only call these with non-touch devices)
            this.createDocumentEvent('mousemove', e => {
                if(e.touches) return;
                this._onMouseMove(e);
            }, false);

            this.createDocumentEvent('mouseup', e => {
                if(e.touches) return;
                this._onMouseUp(e);
            }, false);

            this.createCanvasEvent('mousedown', e => {
                if(e.touches) return;
                this._timeline_onMouseDown(e);
            }, false);

            // Auto-close popup menu if there is a click off-canvas
            this.createDocumentEvent('mousedown', e => {
                if(e.touches) return;
                if(e.target !== this._canvas) {
                    this.closePopupMenu();
                    this.draw();
                }
            }, false);

            // Scroll events
            $(this._canvas).on('mousewheel', this._onMouseWheel.bind(this));

            // Touch events
            this.createCanvasEvent('touchstart', e => {
                e.buttons = 0;
                e.clientX = e.touches[0].clientX;
                e.clientY = e.touches[0].clientY;
                this._touchStartX = e.clientX;
                this._touchStartY = e.clientY;
                e.movementX = e.touches[0].movementX;
                e.movementY = e.touches[0].movementY;
                this._onMouseMove(e);
                this._timeline_onMouseDown(e);
            }, false);

            this.createDocumentEvent('touchmove', e => {
                e.buttons = 1;
                e.clientX = e.touches[0].clientX;
                e.clientY = e.touches[0].clientY;
                e.movementX = e.clientX - this._touchStartX;
                e.movementY = e.clientY - this._touchStartY;
                this._touchStartX = e.clientX;
                this._touchStartY = e.clientY;
                this._onMouseMove(e);
            }, false);

            this.createDocumentEvent('touchend', e => {
                this._onMouseUp(e);
            }, false);

            this._mouseEventsAttached = true;
        }
    }

    /**
     * Resize the canvas so that it fits inside the canvas container, call this when the size of the canvas container changes.
     */
    resize () {
        if(!this._canvasContainer || !this._canvas) return;

        var containerWidth = this.canvasContainer.offsetWidth;
        var containerHeight = this.canvasContainer.offsetHeight;

        // Round off canvas size to avoid blurryness.
        containerWidth = Math.floor(containerWidth) - 2;
        containerHeight = Math.floor(containerHeight) - 1;

        if(this._canvas.width !== containerWidth) {
            this._canvas.width = containerWidth;
        }
        if(this._canvas.height !== containerHeight) {
            this._canvas.height = containerHeight;
        }
    };

    /**
     * Draw this GUIElement and update the mouse state
     */
    draw () {
        if(this._drawRequest) {
            cancelAnimationFrame(this._drawRequest);
            this._drawRequest = null;
            this._dirtySections.clear();
        }

        this.resize();

        this._drawnElements = [];
        this._drawTimelineRegion({
            x: 0,
            y: 0,
            width: this.canvas.width,
            height: this.canvas.height,
        });
        this._drawTooltips();
        this._lastTooltipRect = this._calculateTooltipRect();
    }

    requestDraw (...sections) {
        sections.forEach(section => {
            if(section) {
                this._dirtySections.add(section);
            }
        });

        if(this._drawRequest) return;

        this._drawRequest = requestAnimationFrame(() => {
            this._drawRequest = null;

            var dirtySections = [...this._dirtySections];
            this._dirtySections.clear();

            if(dirtySections.length === 0) {
                this.draw();
                return;
            }

            var hasMainSection = dirtySections.some(section => {
                return section === 'numberLine' || section === 'frameGrid';
            });

            if(hasMainSection) {
                this.draw();
                return;
            }

            if(dirtySections.length === 1 && dirtySections[0] === 'tooltips') {
                this._redrawTooltipsRegion();
                return;
            }

            this.draw();
        });
    }

    _drawTimelineRegion (rect) {
        var ctx = this.ctx;

        ctx.save();
        ctx.beginPath();
        ctx.rect(rect.x, rect.y, rect.width, rect.height);
        ctx.clip();
        ctx.clearRect(rect.x, rect.y, rect.width, rect.height);

        this.model.activeTimeline.guiElement.draw();

        if(this._popupMenu) {
            this._popupMenu.draw();
        }
        ctx.restore();
    }

    _drawTooltips () {
        this._mouseHoverTargets.forEach(target => {
            if(target.tooltip) {
                target.tooltip.draw(target.localTranslation.x, target.localTranslation.y);
            }
        });
    }

    _calculateTooltipRect () {
        var rect = null;
        var ctx = this.ctx;

        ctx.save();
        ctx.font = '14px Nunito Sans';

        this._mouseHoverTargets.forEach(target => {
            if(!target.tooltip || !target.tooltip.label) return;

            var textWidth = ctx.measureText(target.tooltip.label).width;
            var textHeight = 14;
            var tx = target.localTranslation.x - textWidth / 2;
            var ty = target.localTranslation.y + textHeight;

            var xMin = 3;
            if(tx < xMin) tx = xMin;
            if(ty > this.canvas.height) {
                ty = this.canvas.height - 35;
            } else if (ty > this.canvas.height - 25) {
                ty = this.canvas.height - 20;
            }

            var margin = 4;
            var tooltipRect = {
                x: tx - margin / 2,
                y: ty - margin / 2,
                width: textWidth + margin,
                height: textHeight + margin,
            };

            if(!rect) {
                rect = tooltipRect;
                return;
            }

            var minX = Math.min(rect.x, tooltipRect.x);
            var minY = Math.min(rect.y, tooltipRect.y);
            var maxX = Math.max(rect.x + rect.width, tooltipRect.x + tooltipRect.width);
            var maxY = Math.max(rect.y + rect.height, tooltipRect.y + tooltipRect.height);

            rect = {
                x: minX,
                y: minY,
                width: maxX - minX,
                height: maxY - minY,
            };
        });

        ctx.restore();
        return rect;
    }

    _redrawTooltipsRegion () {
        var oldRect = this._lastTooltipRect;
        var nextRect = this._calculateTooltipRect();

        if(!oldRect && !nextRect) {
            return;
        }

        var redrawRect = oldRect;
        if(oldRect && nextRect) {
            var minX = Math.min(oldRect.x, nextRect.x);
            var minY = Math.min(oldRect.y, nextRect.y);
            var maxX = Math.max(oldRect.x + oldRect.width, nextRect.x + nextRect.width);
            var maxY = Math.max(oldRect.y + oldRect.height, nextRect.y + nextRect.height);
            redrawRect = {
                x: minX,
                y: minY,
                width: maxX - minX,
                height: maxY - minY,
            };
        } else if(nextRect) {
            redrawRect = nextRect;
        }

        var drawnElements = this._drawnElements;
        this._drawnElements = [];
        this._drawTimelineRegion(redrawRect);
        this._drawnElements = drawnElements;

        this._drawTooltips();
        this._lastTooltipRect = nextRect;
    }

    /**
     * Give a function to call when the timeline modifies the project.
     * @param {function} fn - the function to call
     */
    onProjectModified (fn) {
        this._onProjectModified = fn;
    }

    /**
     * Give a function to call when the timeline "soft modifies" the project (moving the playhead, etc).
     * @param {function} fn - the function to call
     */
    onProjectSoftModified (fn) {
        this._onProjectSoftModified = fn;
    }

    /**
     * Add a GUIElement to the list of objects that were drawn in the last draw call.
     * @param {Wick.GUIElement} elem - the GUIElement to add
     */
    markElementAsDrawn (elem) {
        this._drawnElements.push(elem);
    }

    /**
     * The amount the timeline is scrolled horizontally.
     * @type {number}
     */
    get scrollX () {
        return this._scrollX;
    }

    set scrollX (scrollX) {
        if(scrollX < 0) scrollX = 0;
        if(scrollX > this.horizontalScrollSpace) scrollX = this.horizontalScrollSpace;
        this._scrollX = scrollX;
    }

    /**
     * The amount the timeline is scrolled vertically.
     * @type {number}
     */
    get scrollY () {
        return this._scrollY;
    }

    set scrollY (scrollY) {
        if(scrollY < 0) scrollY = 0;
        if(scrollY > this.verticalScrollSpace) scrollY = this.verticalScrollSpace;
        this._scrollY = scrollY;
    }

    /**
     * The amount of distance the timeline can be scrolled horizontally. Depends on the number of frames.
     * @type {number}
     */
    get horizontalScrollSpace () {
        return (this.model.activeTimeline.length * this.gridCellWidth * 3) + 500;
    }

    /**
     * The amount of distance the timeline can be scrolled vertically. Depends on the number of layers.
     * @type {number}
     */
    get verticalScrollSpace () {
        return this.model.activeTimeline.layers.length * this.gridCellHeight + this.gridCellHeight * 2;
    }

    /**
     * Open a popup menu
     * @param {Wick.GUIElement.PopupMenu} popupMenu - the PopupMenu to open
     */
    openPopupMenu (popupMenu) {
        this._popupMenu = popupMenu;
        this.draw();
    }

    /**
     * Close the current popup menu
     */
    closePopupMenu () {
        this._popupMenu = null;
        this.draw();
    }

    /**
     * String representation of the current frame size, can be "small", "normal", or "large".
     * @type {string}
     */
    get frameSizeMode () {
        if(Wick.GUIElement.GRID_DEFAULT_CELL_WIDTH === Wick.GUIElement.GRID_SMALL_CELL_WIDTH) {
            return 'small';
        } else if(Wick.GUIElement.GRID_DEFAULT_CELL_WIDTH === Wick.GUIElement.GRID_NORMAL_CELL_WIDTH) {
            return 'normal'
        } else if(Wick.GUIElement.GRID_DEFAULT_CELL_WIDTH === Wick.GUIElement.GRID_LARGE_CELL_WIDTH) {
            return 'large';
        }
    }

    /**
     * Drop an asset onto the timeline.
     * @param {string} uuid - The UUID of the desired asset.
     * @param {number} x - The x location of the image after creation in relation to the window.
     * @param {number} y - The y location of the image after creation in relation to the window.
     * @param {boolean} drop - If true, will drop the asset with the uuid onto the hovered frame, modifying the frame.
     */
    dragAssetAtPosition (uuid, x, y, drop) {
        this._onMouseMove({clientX: x, clientY: y, buttons: 0});
        var target = this._getTopMouseTarget();
        if(!target || !(target.model instanceof Wick.Frame)) {
            return;
        }

        var frame = target.model;
        var asset = target.project.model.getAssetByUUID(uuid);
        var oldSound = frame.sound;
        frame.sound = asset;

        if(drop) {
            this.projectWasModified();
        } else {
            this.draw();
            if(oldSound) {
                frame.sound = oldSound;
            } else {
                frame.removeSound();
            }
        }
    }

    /**
     * Auto scrolls the timeline if the playhead is considered off-screen.
     * This is built specifically for moving the playead with hotkeys.
     */
    checkForPlayheadAutoscroll () {
        var scrollWidth = this.canvas.width;
        scrollWidth -= Wick.GUIElement.LAYERS_CONTAINER_WIDTH;
        scrollWidth -= Wick.GUIElement.SCROLLBAR_SIZE;
        scrollWidth -= this.gridCellWidth;

        var scrollMin = this.scrollX;
        var scrollMax = this.scrollX + scrollWidth;

        var playheadPosition = this.model.activeTimeline.playheadPosition;
        var playheadX = (playheadPosition - 1) * this.gridCellWidth;

        if(playheadX < scrollMin) {
            this.scrollX = playheadX;
            this.draw();
        } if (playheadX > scrollMax) {
            this.scrollX = playheadX - scrollWidth;
            this.draw();
        }
    }

    _onMouseMove (e) {
        // Update mouse position
        var rect = this._canvas.getBoundingClientRect();
        this._mouse = {
            x: e.clientX - rect.left,
            y: e.clientY - rect.top
        };

        // Optimization: Only update if the mouse is on the canvas (unless something is being dragged)
        var mouseOffCanvas = (
            this._mouse.x < 0 ||
            this._mouse.y < 0 ||
            this._mouse.x > this.canvas.width ||
            this._mouse.y > this.canvas.height);
        if(e.buttons === 0 && !this.canvasClicked && mouseOffCanvas) {
            if(this._mouseHoverTargets.length > 0) {
                this._mouseHoverTargets = [];
                // Mouse left the canvas: clear hover targets and fully redraw to remove any hover visuals.
                this.requestDraw();
            }
            return;
        }

        // Update mouse targets
        if(e.buttons === 0) {
            // Mouse moved - find new hover targets
            this._mouseHoverTargets = this._drawnElements.filter(elem => {
                return elem.model.project && elem.mouseInBounds(this._mouse);
            });

            // Update cursor
            var top = this._getTopMouseTarget();
            if(top) {
                this.canvas.style.cursor = top.cursor
            } else {
                this.canvas.style.cursor = 'default';
            }
        } else {
            // Mouse is dragging - fire drag events if needed
            if(!this.canvasClicked) {
                // Don't drag if the click didn't originate from the canvas.
            } else if (!this._mouseHasMoved(this._clickXY, {x:e.clientX, y:e.clientY}, 5)) {
                // Don't start dragging things until the mouse has moved a little bit.
            } else {
                this._onMouseDrag(e);
            }
        }

        this.requestDraw();
    }

    _timeline_onMouseDown (e) {
        this.closePopupMenu();
        this.canvasClicked = true;
        this._clickXY = {x: e.clientX, y: e.clientY};

        if(this._mouseHoverTargets.length === 0) {
            // Clicked nothing - clear the selection
            this.model.selection.clear();
        } else {
            // Clicked something - run that element's onMouseDown
            this._lastClickedElem = this._getTopMouseTarget();
            this._lastClickedElem.onMouseDown(e);
        }

        this.draw();
    }

    _onMouseUp (e) {
        // Call mouse event functions on the elements interacted with
        var target = this._getTopMouseTarget();
        if(this.canvasClicked && this._isDragging) {
            target && target.onMouseUp(e);
        } else if (this.canvasClicked && this._lastClickedElem === target) {
            target && target.onMouseUp(e);
        }

        this.canvasClicked = false;
        this._isDragging = false;

        this.draw();

        // Call mousemove so that the next mouse targets can be found without having to move the mouse again
        this._onMouseMove(e);

        clearInterval(this.autoscrollInterval);
        this.autoscrollInterval = null;
    }

    _onMouseDrag (e) {
        this._isDragging = true;

        // Call event functons on the elements interacted with
        var target = this._getTopMouseTarget();
        if(target) {
            this.canvas.style.cursor = 'grabbing';
            target.onMouseDrag(e);
            this._doAutoScroll(target);
        }
    }

    /**
     * Refers to mousewheel events on the timeline.
     * @param {*} e 
     */
    _onMouseWheel (e) {
        e.preventDefault();
        if (!this.model.isPublished) {
            var dx = e.deltaX * e.deltaFactor * 0.5;
            var dy = e.deltaY * e.deltaFactor * 0.5;
            this.scrollX += dx;
            this.scrollY -= dy;
            this.requestDraw('numberLine', 'frameGrid');
        }
    }

    _getTopMouseTarget () {
        var l = this._mouseHoverTargets.length-1;
        return this._mouseHoverTargets[l];
    }

    _doAutoScroll (target) {
        if(this.autoscrollInterval) return;

        this.autoscrollInterval = setInterval(() => {
            var left = Wick.GUIElement.LAYERS_CONTAINER_WIDTH;
            var right = this.canvas.width - Wick.GUIElement.SCROLLBAR_SIZE;
            var top = Wick.GUIElement.NUMBER_LINE_HEIGHT + Wick.GUIElement.BREADCRUMBS_HEIGHT;
            var bottom = this.canvas.height - Wick.GUIElement.SCROLLBAR_SIZE;

            var distFromLeft = this._mouse.x - left;
            var distFromRight = this._mouse.x - right;
            var distFromTop = this._mouse.y - top;
            var distFromBottom = this._mouse.y - bottom;

            if(target.canAutoScrollX) {
                if(this._mouse.x > right) {
                    this.scrollX += distFromRight * Wick.GUIElement.AUTO_SCROLL_SPEED;
                }
                if(this._mouse.x < left) {
                    this.scrollX += distFromLeft * Wick.GUIElement.AUTO_SCROLL_SPEED;
                }
            }
            if(target.canAutoScrollY) {
                if(this._mouse.y > bottom) {
                    this.scrollY += distFromBottom * Wick.GUIElement.AUTO_SCROLL_SPEED;
                }
                if(this._mouse.y < top) {
                    this.scrollY += distFromTop * Wick.GUIElement.AUTO_SCROLL_SPEED;
                }
            }

            this.requestDraw('numberLine', 'frameGrid');
        }, 16);
    }

    _mouseHasMoved (origMouse, currMouse, amount) {
        var d = {
            x: Math.abs(origMouse.x - currMouse.x),
            y: Math.abs(origMouse.y - currMouse.y),
        };
        return d.x > amount || d.y > amount;
    }
}
