(function() {

  /**
   * Normalize browsers measureText method.
   * On Safari and maybe other browsers, measureText gives a different value.
   */
  var measureTextCache = {};
  CanvasRenderingContext2D.prototype.originalMeasureText = CanvasRenderingContext2D.prototype.measureText;
  CanvasRenderingContext2D.prototype.measureText = function (t) {
    var w = 0, obj = {};
    if (typeof measureTextCache[this.font] === 'undefined') {
      measureTextCache[this.font] = {};
    }
    else {
      obj = measureTextCache[this.font];
    }
    for (var i = 0; i < t.length; i++) {
      if (typeof obj[t[i]] !== 'undefined') {
        w += obj[t[i]];
      }
      else {
        obj[t[i]] = this.originalMeasureText(t[i]).width;
        w += obj[t[i]];
      }
    }
    measureTextCache[this.font] = obj;
    return { width: w };
  };

  /**
   * Override _setObjectScale and add Textbox specific resizing behavior. Resizing
   * a Textbox doesn't scale text, it only changes width and makes text wrap automatically.
   */
  var setObjectScaleOverridden = fabric.Canvas.prototype._setObjectScale;
  fabric.Canvas.prototype._setObjectScale = function(localMouse, transform,
    lockScalingX, lockScalingY, by, lockScalingFlip) {

    var t = transform.target;
    if (t instanceof fabric.Textbox) {
      var w = t.width * ((localMouse.x / transform.scaleX) / (t.width + t.strokeWidth)),
        h = t.height * ((localMouse.y / transform.scaleY) / (t.height + t.strokeWidth)),
        resizeHeight = ['mb'].indexOf(t.__corner) !== -1,
        resizeWidth = ['mr'].indexOf(t.__corner) !== -1,
        resizeBoth = ['br'].indexOf(t.__corner) !== -1,
        sw = t.currentWidth,
        sh = t.currentHeight;

      if ((resizeWidth || resizeBoth) && w >= t.minWidth) {
        sw = w;
      }
      if ((resizeHeight || resizeBoth) && h >= t.minHeight) {
        sh = h;
      }
      t.set('width', sw);
      t.set('height', sh);

      t.setClipTo(function (ctx) {
        ctx.rect(-sw / 2, -sh / 2, sw, sh);
      });
    }
    else {
      setObjectScaleOverridden.call(fabric.Canvas.prototype, localMouse, transform,
        lockScalingX, lockScalingY, by, lockScalingFlip);
    }
  };

  /**
   * Sets controls of this group to the Textbox's special configuration if
   * one is present in the group. Deletes _controlsVisibility otherwise, so that
   * it gets initialized to default value at runtime.
   */
  fabric.Group.prototype._refreshControlsVisibility = function() {
    if (typeof fabric.Textbox === 'undefined') {
      return;
    }
    for (var i = this._objects.length; i--; ) {
      if (this._objects[i] instanceof fabric.Textbox) {
        this.setControlsVisibility(fabric.Textbox.getTextboxControlVisibility());
        return;
      }
    }
  };

})();
