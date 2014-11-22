var our = null;
var gctx = null;

(function () {
  var clone = fabric.util.object.clone;

  /**
   * Textbox class, based on IText, allows the user to resize the text rectangle
   * and wraps lines automatically.
   * @class fabric.Textbox
   * @extends fabric.IText
   * @mixes fabric.Observable
   * @return {fabric.Textbox} thisArg
   * @see {@link fabric.Textbox#initialize} for constructor definition
   */
  fabric.Textbox = fabric.util.createClass(fabric.IText, fabric.Observable, {
    /**
     * Type of an object
     * @type String
     * @default
     */
    type: 'textbox',
    scaleBehavior: 'textbox_resize',
    /**
     * Minimum width of textbox, in pixels.
     * @type Number
     * @default
     */
    minWidth: 20,
    minHeight: 20,

    autoresize: true,
    maxFontPixels: 40,
    minFontPixels: 4,

    lastResize: Date.now(),
    resizeDelay: 150,
    firstResize: true,

    lineEndCursorOffset: 2, // 2 for current line end, 1 for next line start

    /**
     * Cached array of text wrapping.
     * @type Array
     */
    __cachedLines: null,
    /**
     * Constructor. Some scaling related property values are forced. Visibility
     * of controls is also fixed; only the rotation and width controls are
     * made available.
     * @param {String} text Text string
     * @param {Object} [options] Options object
     * @return {fabric.Textbox} thisArg
     */
    initialize: function (text, options) {
      this.initializeTextboxBehavior();

      this.callSuper('initialize', text, options);
      this.set('lockUniScaling', false);
      this.set('lockScalingY', true);
      this.set('lockScalingFlip', true);
      this.set('hasBorders', true || options.hasBorders);
      this.setControlsVisibility(fabric.Textbox.getTextboxControlVisibility());

      // add width to this list of props that effect line wrapping.
      this._dimensionAffectingProps.width = true;

      // fix safari 8's broken measureText native method
      // the caching should also make my measureText implementention to work faster then the native method on large ammounts of data
      var cache = {};
      CanvasRenderingContext2D.prototype.originalMeasureText = CanvasRenderingContext2D.prototype.measureText;
      CanvasRenderingContext2D.prototype.measureText = function (t) {
        var w = 0, obj = {};
        if (typeof cache[this.font] == 'undefined') {
          cache[this.font] = {};
        } else {
          obj = cache[this.font];
        }
        for (var i = 0; i < t.length; i++) {
          if (typeof obj[t[i]] != 'undefined') {
            w += obj[t[i]];
          } else {
            obj[t[i]] = this.originalMeasureText(t[i]).width;
            w += obj[t[i]];
          }
        }
        cache[this.font] = obj;
        return { width: w };
      };

      // some very very dirty hacks, caused from resizeDelay parameters large values
      var that = this;
      var localHack = function () {
        that.set('width', that.currentWidth);
      };

      var delay = options.resizeDelay + 100;

      for (var i = 50; i <= delay; i += 50) {
        setTimeout(localHack, i);
      }
    },

    /**
     * Override _setObjectScale and add Textbox specific resizing behavior. Resizing
     * a Textbox doesn't scale text, it only changes width and makes text wrap automatically.
     */
    initializeTextboxBehavior: function () {
      var setObjectScaleOverridden = fabric.Canvas.prototype._setObjectScale;
      fabric.Canvas.prototype._setObjectScale = function (localMouse, transform, lockScalingX, lockScalingY, by, lockScalingFlip) {
        var t = transform.target;
        if (typeof t.scaleBehavior !== 'undefined' && t.scaleBehavior === 'textbox_resize') {
          var w = t.width * ((localMouse.x / transform.scaleX) / (t.width + t.strokeWidth)),
            h = t.height * ((localMouse.y / transform.scaleY) / (t.height + t.strokeWidth));

          var resizeHeight = ['mb'].indexOf(t.__corner) !== -1,
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
          setObjectScaleOverridden.call(fabric.Canvas.prototype, localMouse, transform, lockScalingX, lockScalingY, by, lockScalingFlip);
        }
      };
    },
    /**
     * Wraps text using the 'width' property of Textbox. First this function
     * splits text on newlines, so we preserve newlines entered by the user.
     * Then it wraps each line using the width of the Textbox by calling
     * _wrapLine().
     * @param {CanvasRenderingContext2D} ctx Context to use for measurements
     * @param {String} text The string of text that is split into lines
     * @returns {Array} Array of lines
     */
    _wrapText: function (ctx, text, returnHeightMode) {
      var lines = text.split(this._reNewline), wrapped = [], i, totalHeight = 0;

      for (i = 0; i < lines.length; i++) {

        var limit = returnHeightMode ? Infinity : (this.currentHeight - totalHeight),
          wrappedLine = this._wrapLine(ctx, lines[i] + '\n', limit);

        wrapped = wrapped.concat(wrappedLine);
        var textHeight = this._getTextHeight(ctx, wrappedLine);
        // var textHeight = wrappedLine.length * this.fontSize * this.lineHeight;
        totalHeight += textHeight;
      }

      return returnHeightMode ? totalHeight : wrapped;
    },
    /**
     * @private
     * @param {CanvasRenderingContext2D} ctx Context to render on
     * @param {Array} textLines Array of all text lines
     * @return {Number} Height of fabric.Text object
     */
    _getTextHeight: function(ctx, textLines) {
      if (this.autoresize) {
        return this.fontSize * textLines.length * this.lineHeight;
      }
      return this.callSuper('_getTextHeight', ctx, textLines);
    },
    /**
     * Wraps a line of text using the width of the Textbox and a context.
     * @param {CanvasRenderingContext2D} ctx Context to use for measurements
     * @param {String} text The string of text to split into lines
     * @returns {Array} Array of line(s) into which the given text is wrapped
     * to.
     */
    _wrapLine: function (ctx, text, limit) {
      var maxWidth = this.width, words = text.split(' '),
        lines = [],
        line = '';

      if (ctx.measureText(text).width < maxWidth) {
        lines.push(text);
      }
      else {
        while (words.length > 0) {

          /*
           * If the textbox's width is less than the widest letter.
           * TODO: Performance improvement - catch the width of W whenever
           * fontSize changes.
           */
          if (maxWidth <= ctx.measureText('W').width) {
            return text.split('');
          }

          /*
           * This handles a word that is longer than the width of the
           * text area.
           */
          while (Math.ceil(ctx.measureText(words[0]).width) >= maxWidth) {
            var tmp = words[0];
            words[0] = tmp.slice(0, -1);
            if (words.length > 1) {
              words[1] = tmp.slice(-1) + words[1];
            }
            else {
              words.push(tmp.slice(-1));
            }
          }

          if (Math.ceil(ctx.measureText(line + words[0]).width) < maxWidth) {
            line += words.shift() + ' ';
          }
          else {
            var oldLines = lines;
            lines.push(line);
            if (this._getTextHeight(ctx, lines) > limit) {
              lines.pop();
              break;
            }
            line = '';
          }

          if (words.length === 0) {
            lines.push(line.substring(0, line.length - 1));
            if (this._getTextHeight(ctx, lines) > limit) {
              lines.pop();
              break;
            }
          }
        }
      }

      return lines;
    },
    /**
     * Gets lines of text to render in the Textbox. This function calculates
     * text wrapping on the fly everytime it is called.
     * @param {CanvasRenderingContext2D} ctx The context to use for measurements
     * @param {Boolean} [refreshCache] If true, text wrapping is calculated and cached even if it was previously cache.
     * @returns {Array} Array of lines in the Textbox.
     */
    _getTextLines: function (ctx, refreshCache) {

      var l = this._getCachedTextLines();
      if (l !== null && refreshCache !== true) {
        return l;
      }

      ctx = (ctx || this.ctx);

      ctx.save();
      this._setTextStyles(ctx);

      l = this._wrapText(ctx, this.text);

      ctx.restore();
      this._cacheTextLines(l);
      return l;
    },
    /**
     * Sets specified property to a specified value. Overrides super class'
     * function and invalidates the cache if certain properties are set.
     * @param {String} key
     * @param {Any} value
     * @return {fabric.Text} thisArg
     * @chainable
     */
    _set: function (key, value) {
      if (key in this._dimensionAffectingProps) {
        this._cacheTextLines(null);
      }

      this.callSuper('_set', key, value);

    },
    /**
     * Save text wrapping in cache. Pass null to this function to invalidate cache.
     * @param {Array} l
     */
    _cacheTextLines: function (l) {
      this.__cachedLines = l;
    },
    /**
     * Fetches cached text wrapping. Returns null if nothing is cached.
     * @returns {Array}
     */
    _getCachedTextLines: function () {
      return this.__cachedLines;
    },
    /**
     * Overrides the superclass version of this function. The only change is
     * that this function does not change the width of the Textbox. That is
     * done manually by the user.
     * @param {CanvasRenderingContext2D} ctx Context to render on
     */
    _renderViaNative: function (ctx) {
      our = this;
      gctx = ctx;
      if (this.autoresize) {


        var maxHeight = this.currentHeight,
            minFontPixels = this.minFontPixels,
            maxFontPixels = this.maxFontPixels <= 0 ? maxHeight : this.maxFontPixels;

        // console.log(ctx.measureText(this.text).width);

        // this.text.length
        // var wWidth = ctx.measureText('_').width;
        // var lineHeight = this._getHeightOfLine();
        // var newLineHeight = this.text.split(this._reNewline).length * lineHeight;
        // var Volume = (this.currentHeight - newLineHeight) * this.currentWidth;
        // var x = Volume / (wWidth * lineHeight * this.text.length);

        var oldFontSize = this.fontSize,
            autoFontSize = this._autosizing(ctx, maxHeight, minFontPixels, maxFontPixels);

        this.fontSize = autoFontSize;

        // console.log(x, autoFontSize, newLineHeight, maxHeight);
      }

      this._setTextStyles(ctx);

      var textLines = this._wrapText(ctx, this.text);

      this.clipTo && fabric.util.clipContext(this, ctx);

      this._renderTextBackground(ctx, textLines);
      this._translateForTextAlign(ctx);
      this._renderText(ctx, textLines);

      if (this.textAlign !== 'left' && this.textAlign !== 'justify') {
        ctx.restore();
      }

      this._renderTextDecoration(ctx, textLines);
      this.clipTo && ctx.restore();

      this._setBoundaries(ctx, textLines);
      this._totalLineHeight = 0;
    },

    /**
     * Returns 2d representation (lineIndex and charIndex) of cursor (or selection start).
     * Overrides the superclass function to take into account text wrapping.
     * @param {Number} selectionStart Optional index. When not given, current selectionStart is used.
     * @returns {Object} This object has 'lineIndex' and 'charIndex' properties set to Numbers.
     */
    get2DCursorLocation: function (selectionStart) {


      /*

      if (typeof selectionStart === 'undefined') {
        selectionStart = this.selectionStart;
      }
      var textBeforeCursor = this.text.slice(0, selectionStart),
          linesBeforeCursor = textBeforeCursor.split(this._reNewline);

      return {
        lineIndex: linesBeforeCursor.length - 1,
        charIndex: linesBeforeCursor[linesBeforeCursor.length - 1].length
      };


      */

      if (typeof selectionStart === 'undefined') {
        selectionStart = this.selectionStart;
      }

      // console.log('ss', selectionStart);

      /*
       * We use `temp` to populate linesBeforeCursor instead of simply splitting
       * textBeforeCursor with newlines to handle the case of the
       * selectionStart value being on a word that, because of its length,
       * needs to be wrapped to the next line.
       */
      var lineIndex = 0,
        linesBeforeCursor = [],
        allLines = this._getTextLines(), temp = selectionStart;

      while (temp >= 0) {
        if (lineIndex > allLines.length - 1) {
          break;
        }
        temp -= allLines[lineIndex].length;
        if (temp < 0) {
          linesBeforeCursor[linesBeforeCursor.length] = allLines[lineIndex].slice(0,
            temp + allLines[lineIndex].length);
        }
        else {
          linesBeforeCursor[linesBeforeCursor.length] = allLines[lineIndex];
        }
        lineIndex++;
      }
      lineIndex--;

      var lastLine = linesBeforeCursor[linesBeforeCursor.length - 1],
          charIndex = lastLine.length;

      if (linesBeforeCursor[lineIndex] === allLines[lineIndex]) {
        if (lineIndex + 1 < allLines.length - 1) {
          lineIndex++;
          charIndex = 0;
        }
      }

      return {
        lineIndex: lineIndex,
        charIndex: charIndex
      };
    },
    /**
     * Overrides superclass function and uses text wrapping data to get cursor
     * boundary offsets.
     * @param {Array} chars
     * @param {String} typeOfBoundaries
     * @param {Object} cursorLocation
     * @param {Array} textLines
     * @returns {Object} Object with 'top', 'left', and 'lineLeft' properties set.
     */
    _getCursorBoundariesOffsets: function (chars, typeOfBoundaries, cursorLocation, textLines) {
      var leftOffset = 0,
        topOffset = typeOfBoundaries === 'cursor'
          // selection starts at the very top of the line,
          // whereas cursor starts at the padding created by line height
          ? ((cursorLocation.lineIndex !== 0 ? this.callSuper('_getHeightOfLine', this.ctx, 0)
          : this._getHeightOfLine(this.ctx, 0)) -
        this.getCurrentCharFontSize(cursorLocation.lineIndex, cursorLocation.charIndex))
          : 0, lineChars = textLines[cursorLocation.lineIndex].split('');

      for (var i = 0; i < cursorLocation.charIndex; i++) {
        leftOffset += this._getWidthOfChar(this.ctx, lineChars[i], cursorLocation.lineIndex, i);
      }

      for (i = 0; i < cursorLocation.lineIndex; i++) {
        topOffset += this._getCachedLineHeight(i);
      }

      var lineLeftOffset = this._getCachedLineOffset(cursorLocation.lineIndex, textLines);

      this._clearCache();

      return {
        top: topOffset,
        left: leftOffset,
        lineLeft: lineLeftOffset
      };
    },

    /**
     * Overrides superclass function and adjusts cursor offset value because
     * lines do not necessarily end with a newline in Textbox.
     * @param {Event} e
     * @param {Boolean} isRight
     * @returns {Number}
     */
    getDownCursorOffset: function (e, isRight) {
      return this.callSuper('getDownCursorOffset', e, isRight) - 1;
    },
    /**
     * Overrides superclass function and adjusts cursor offset value because
     * lines do not necessarily end with a newline in Textbox.
     * @param {Event} e
     * @param {Boolean} isRight
     * @returns {Number}
     */
    getUpCursorOffset: function (e, isRight) {
      return this.callSuper('getUpCursorOffset', e, isRight) - 1;
    },

    /**
     * Overrides super class' function and effects lineHeight behavior to not
     * apply lineHeight to the first line, which is in accordance to its official
     * typographic definition.
     * @param {CanvasRenderingContext2D} ctx
     * @param {Number} lineIndex
     * @param {Array} textLines
     * @returns {Number}
     */
    _getHeightOfLine: function (ctx, lineIndex, textLines) {

      if (this.autoresize) {
        return this.fontSize * this.lineHeight;
      }

      if (lineIndex === 0) {
        textLines = textLines || this._getTextLines(ctx);
        return this._getHeightOfChar(ctx, textLines[lineIndex][0], lineIndex, 0);
      }
      return this.callSuper('_getHeightOfLine', ctx, lineIndex, textLines);
    },
    /*
     * - Start from the minimal allowed value (`minFontPixels`)
     * - Guesses an average font size (in pixels) for the font,
     * - Resizes the text and sees if its size is within the
     *   boundaries (`minFontPixels` and `maxFontPixels`).
     * - If so, keep guessing until we break.
     * - If not, return the last calculated size.
    */
    _autosizing: function (ctx, maxHeight, minFontPixels, maxFontPixels) {

      var timeDiff = Date.now() - this.lastResize;
      if (timeDiff <= this.resizeDelay && !this.firstResize) {
        minFontPixels = this.fontSize;
      } else {
        this.firstResize = false;
        this.lastResize = Date.now();

        while (minFontPixels < (maxFontPixels - 1)) {

          var fontSize = Math.floor((minFontPixels + maxFontPixels) / 2);

          var funcVal = this._autosizing_calc_height(fontSize, ctx);
          if (funcVal <= maxHeight) {
            minFontPixels = fontSize;

            if (funcVal == maxHeight)
              break;
          }
          else
            maxFontPixels = fontSize;
        }

        if (this._autosizing_calc_height(maxFontPixels, ctx) <= maxHeight) {
          minFontPixels = maxFontPixels;
        }
      }

      return minFontPixels;
    },
    /*
     * Sets font size and returns calculated text height
    */
    _autosizing_calc_height: function (fontSize, ctx) {
      this.fontSize = fontSize;
      this._setTextStyles(ctx);
      return this._wrapText(ctx, this.text, true);
    },
    /**
     * Returns object representation of an instance
     * @method toObject
     * @param {Array} [propertiesToInclude] Any properties that you might want to additionally include in the output
     * @return {Object} object representation of an instance
     */
    toObject: function (propertiesToInclude) {
      return fabric.util.object.extend(this.callSuper('toObject', propertiesToInclude), {
        minWidth: this.minWidth
      });
    }
  });
  /**
   * Returns fabric.Textbox instance from an object representation
   * @static
   * @memberOf fabric.Textbox
   * @param {Object} object Object to create an instance from
   * @return {fabric.Textbox} instance of fabric.Textbox
   */
  fabric.Textbox.fromObject = function (object) {
    return new fabric.Textbox(object.text, clone(object));
  };
  /**
  * Returns the default controls visibility required for Textboxes.
  * @returns {Object}
  */
  fabric.Textbox.getTextboxControlVisibility = function() {
   return {
    tl: false,
    tr: false,
    br: true,
    bl: false,
    ml: false,
    mt: false,
    mr: true,
    mb: true,
    mtr: true
   };
  };

  /**
   * Contains all fabric.Textbox objects that have been created
   * @static
   * @memberof fabric.Textbox
   * @type Array
   */
  fabric.Textbox.instances = [];
})();
