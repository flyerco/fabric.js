(function() {

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
        resizeHeight = ['mt', 'mb'].indexOf(t.__corner) !== -1,
        resizeWidth = ['ml', 'mr'].indexOf(t.__corner) !== -1,
        resizeBoth = ['tl', 'tr', 'br', 'bl'].indexOf(t.__corner) !== -1,
        sw = Math.abs(t.width * t.scaleX),
        sh = Math.abs(t.height * t.scaleY);

      if ((resizeWidth || resizeBoth) && w >= t.minWidth) {
        sw = w;
      }
      if ((resizeHeight || resizeBoth) && h >= t.minHeight) {
        sh = h;
      }
      t.set('width', sw);
      t.set('height', sh);
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
