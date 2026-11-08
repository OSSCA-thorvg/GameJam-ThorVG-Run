/**
 * ThorVG constants and enums
 * @category Constants
 */
/**
 * Blend method for compositing paint layers.
 *
 * Defines various blending modes for combining a source paint (top layer) with a destination (bottom layer).
 * Notation: S = source paint, D = destination, Sa = source alpha, Da = destination alpha.
 * @category Constants
 */
declare enum BlendMethod {
    /** Perform alpha blending (default). S if (Sa == 255), otherwise (Sa * S) + (255 - Sa) * D */
    Normal = 0,
    /** Multiply the RGB values of each pixel. (S * D) */
    Multiply = 1,
    /** Invert, multiply, and invert again. (S + D) - (S * D) */
    Screen = 2,
    /** Combines Multiply and Screen modes. (2 * S * D) if (D < 128), otherwise 255 - 2 * (255 - S) * (255 - D) */
    Overlay = 3,
    /** Retains the smallest components. min(S, D) */
    Darken = 4,
    /** Retains the largest components. max(S, D) */
    Lighten = 5,
    /** Divides the bottom layer by the inverted top layer. D / (255 - S) */
    ColorDodge = 6,
    /** Divides the inverted bottom layer by the top layer, then inverts. 255 - (255 - D) / S */
    ColorBurn = 7,
    /** Same as Overlay but with color roles reversed. (2 * S * D) if (S < 128), otherwise 255 - 2 * (255 - S) * (255 - D) */
    HardLight = 8,
    /** Similar to Overlay but softer. (255 - 2 * S) * (D * D) + (2 * S * D) */
    SoftLight = 9,
    /** Absolute difference between layers. (S - D) if (S > D), otherwise (D - S) */
    Difference = 10,
    /** Twice the product subtracted from the sum. S + D - (2 * S * D) */
    Exclusion = 11,
    /** Combine with HSL(Sh + Ds + Dl) then convert to RGB */
    Hue = 12,
    /** Combine with HSL(Dh + Ss + Dl) then convert to RGB */
    Saturation = 13,
    /** Combine with HSL(Sh + Ss + Dl) then convert to RGB */
    Color = 14,
    /** Combine with HSL(Dh + Ds + Sl) then convert to RGB */
    Luminosity = 15,
    /** Simply adds pixel values. (S + D) */
    Add = 16,
    /** For intermediate composition layers; suitable for use with Scene or Picture */
    Composition = 255
}
/**
 * Stroke cap style for line endings.
 *
 * Determines the shape of the endpoints of open paths when stroked.
 * @category Shape
 */
declare enum StrokeCap {
    /** Flat cap at the exact endpoint (no extension) */
    Butt = 0,
    /** Rounded cap extending beyond the endpoint by half the stroke width */
    Round = 1,
    /** Square cap extending beyond the endpoint by half the stroke width */
    Square = 2
}
/**
 * Stroke join style for line corners.
 *
 * Determines the shape of corners where two path segments meet when stroked.
 * @category Shape
 */
declare enum StrokeJoin {
    /** Sharp corner with pointed edge (subject to miter limit) */
    Miter = 0,
    /** Rounded corner with circular arc */
    Round = 1,
    /** Flat corner with angled edge (beveled) */
    Bevel = 2
}
/**
 * Fill rule for determining whether a point is inside a shape.
 *
 * Used to determine which regions should be filled when rendering complex paths
 * with self-intersections or multiple contours.
 * @category Shape
 */
declare enum FillRule {
    /** Non-zero winding rule (default) - counts the number of times a path winds around a point */
    Winding = 0,
    /** Even-odd rule - alternates between filled and unfilled regions, useful for complex shapes with holes */
    EvenOdd = 1
}
/**
 * Path command for building shapes.
 *
 * Each command consumes a number of points from the accompanying points array.
 * @category Shape
 */
declare enum PathCommand {
    /** Ends the current sub-path and connects it with its initial point. This command doesn't expect any points. */
    Close = 0,
    /** Sets a new initial point of the sub-path and a new current point. This command expects 1 point: the starting position. */
    MoveTo = 1,
    /** Draws a line from the current point to the given point and sets a new value of the current point. This command expects 1 point: the end-position of the line. */
    LineTo = 2,
    /** Draws a cubic Bezier curve from the current point to the given point using two given control points and sets a new value of the current point. This command expects 3 points: the 1st control-point, the 2nd control-point, the end-point of the curve. */
    CubicTo = 3
}
/**
 * Gradient spread method for areas outside the gradient bounds.
 *
 * Determines how the gradient behaves in regions outside the defined gradient vector.
 * @category Gradients
 */
declare enum GradientSpread {
    /** Extend the edge colors to infinity (default) */
    Pad = 0,
    /** Mirror the gradient pattern */
    Reflect = 1,
    /** Repeat the gradient pattern */
    Repeat = 2
}
/**
 * Mask method for masking operations.
 *
 * Defines various methods for applying masks to paint objects.
 * @category Constants
 */
declare enum MaskMethod {
    /** No masking is applied */
    None = 0,
    /** Alpha masking using the masking target's pixels as an alpha value */
    Alpha = 1,
    /** Alpha masking using the complement to the masking target's pixels */
    InvAlpha = 2,
    /** Alpha masking using the grayscale (0.2126R + 0.7152G + 0.0722B) of the masking target */
    Luma = 3,
    /** Alpha masking using the grayscale of the complement to the masking target */
    InvLuma = 4,
    /** Combines target and source using target alpha. (T * TA) + (S * (255 - TA)) */
    Add = 5,
    /** Subtracts source from target considering alpha. (T * TA) - (S * (255 - TA)) */
    Subtract = 6,
    /** Takes minimum alpha and multiplies with target. (T * min(TA, SA)) */
    Intersect = 7,
    /** Absolute difference between colors. abs(T - S * (255 - TA)) */
    Difference = 8,
    /** Where masks intersect, uses the highest transparency value */
    Lighten = 9,
    /** Where masks intersect, uses the lowest transparency value */
    Darken = 10
}
/**
 * Enumeration to specify rendering engine behavior.
 *
 * The availability or behavior of SmartRender may vary depending on backend support.
 * Currently only the 'sw' renderer supports SmartRender.
 * @category Canvas
 */
declare enum EngineOption {
    /** No engine options are enabled. This may be used to explicitly disable all optional behaviors. */
    None = 0,
    /** Uses the default rendering mode. */
    Default = 1,
    /** Enables automatic partial (smart) rendering optimizations. */
    SmartRender = 2
}
/**
 * Scene effect for post-processing effects.
 *
 * Defines various visual effects that can be applied to a Scene to modify its final appearance.
 * @category Scene
 */
declare enum SceneEffect {
    /** Reset all previously applied scene effects, restoring the scene to its original state */
    ClearAll = 0,
    /** Apply a blur effect with a Gaussian filter. Params: sigma (>0), direction (both/horizontal/vertical), border (unused), quality (0-100) */
    GaussianBlur = 1,
    /** Apply a drop shadow effect with Gaussian blur. Params: color RGB (0-255), opacity (0-255), angle (0-360), distance, blur sigma (>0), quality (0-100) */
    DropShadow = 2,
    /** Override the scene content color with given fill. Params: color RGB (0-255), opacity (0-255) */
    Fill = 3,
    /** Tint the scene color with black and white parameters. Params: black RGB (0-255), white RGB (0-255), intensity (0-100) */
    Tint = 4,
    /** Apply tritone color effect using shadows, midtones, and highlights. Params: shadow RGB, midtone RGB, highlight RGB (all 0-255), blend (0-255) */
    Tritone = 5,
    /** Apply a centered linear motion blur. Params: distance (>=0, scene-local units), angle (degrees, clockwise from the positive X axis), quality (0-100) @beta */
    MotionBlur = 6
}
/**
 * Text wrapping mode for multi-line text layout.
 *
 * Controls how text breaks across multiple lines when it exceeds the layout width.
 * @category Text
 */
declare enum TextWrapMode {
    /** No wrapping - text remains on a single line */
    None = 0,
    /** Wrap at any character boundary */
    Character = 1,
    /** Wrap at word boundaries (default) */
    Word = 2,
    /** Intelligent wrapping with hyphenation support */
    Smart = 3,
    /** Truncate with ellipsis (...) when text exceeds bounds */
    Ellipsis = 4
}
/**
 * Color space enum for raw image data.
 * Specifies the channel order and alpha premultiplication.
 * @category Picture
 */
declare enum ColorSpace {
    /** Alpha, Blue, Green, Red - alpha-premultiplied */
    ABGR8888 = 0,
    /** Alpha, Red, Green, Blue - alpha-premultiplied */
    ARGB8888 = 1,
    /** Alpha, Blue, Green, Red - un-alpha-premultiplied */
    ABGR8888S = 2,
    /** Alpha, Red, Green, Blue - un-alpha-premultiplied */
    ARGB8888S = 3,
    /** Single channel grayscale data */
    Grayscale8 = 4,
    /** Unknown channel data (reserved for initial value) */
    Unknown = 255
}
/**
 * Image filtering method used when a picture is scaled or transformed.
 * @category Picture
 */
declare enum FilterMethod {
    /** Smooth interpolation using surrounding pixels for higher quality (default) */
    Bilinear = 0,
    /** Fast filtering using nearest-neighbor sampling */
    Nearest = 1
}
/**
 * MIME type or format hint for loading picture data.
 *
 * Supported image and vector file formats for Picture class.
 * @category Picture
 */
type MimeType = 'svg' | 'png' | 'jpg' | 'jpeg' | 'webp' | 'raw' | 'lot' | 'lottie+json' | 'mp4';
/**
 * Rendering backend type for Canvas.
 *
 * ThorVG supports three rendering backends, each with different performance
 * characteristics and browser compatibility:
 *
 * ## Available Renderers
 *
 * ### `'sw'` - Software Renderer
 * - **Rendering**: CPU-based software rendering
 * - **Performance**: Slower, but works everywhere
 * - **Compatibility**: All browsers and devices
 * - **Best for**: Maximum compatibility, simple graphics, server-side rendering
 *
 * ### `'gl'` - WebGL Renderer (Recommended)
 * - **Rendering**: GPU-accelerated using WebGL 2.0
 * - **Performance**: Excellent performance with wide browser support
 * - **Compatibility**: Chrome 56+, Firefox 51+, Safari 15+, Edge 79+
 * - **Best for**: Production applications, interactive graphics, animations
 * - **Recommended for most use cases**
 *
 * ### `'wg'` - WebGPU Renderer
 * - **Rendering**: Next-generation GPU API
 * - **Performance**: Best performance for complex scenes
 * - **Compatibility**: Chrome 113+, Edge 113+ (limited support)
 * - **Best for**: Maximum performance, modern browsers only
 *
 * @example
 * ```typescript
 * // Recommended setup with WebGL
 * const TVG = await ThorVG.init({ renderer: 'gl' });
 * const canvas = new TVG.Canvas('#canvas', { width: 800, height: 600 });
 * ```
 *
 * @example
 * ```typescript
 * // Maximum performance with WebGPU (modern browsers only)
 * const TVG = await ThorVG.init({ renderer: 'wg' });
 * ```
 *
 * @example
 * ```typescript
 * // Maximum compatibility with Software renderer
 * const TVG = await ThorVG.init({ renderer: 'sw' });
 * ```
 *
 * @category Other
 */
type RendererType = 'sw' | 'gl' | 'wg';
/**
 * Canvas target object accepted by {@link Canvas}.
 *
 * - `HTMLCanvasElement` - the canvas element itself
 * - `OffscreenCanvas` - an offscreen canvas that transferred to a Web Worker
 *
 * @beta
 * @category Other
 */
type CanvasTarget = HTMLCanvasElement | OffscreenCanvas;

type constants_BlendMethod = BlendMethod;
declare const constants_BlendMethod: typeof BlendMethod;
type constants_CanvasTarget = CanvasTarget;
type constants_ColorSpace = ColorSpace;
declare const constants_ColorSpace: typeof ColorSpace;
type constants_EngineOption = EngineOption;
declare const constants_EngineOption: typeof EngineOption;
type constants_FillRule = FillRule;
declare const constants_FillRule: typeof FillRule;
type constants_FilterMethod = FilterMethod;
declare const constants_FilterMethod: typeof FilterMethod;
type constants_GradientSpread = GradientSpread;
declare const constants_GradientSpread: typeof GradientSpread;
type constants_MaskMethod = MaskMethod;
declare const constants_MaskMethod: typeof MaskMethod;
type constants_MimeType = MimeType;
type constants_PathCommand = PathCommand;
declare const constants_PathCommand: typeof PathCommand;
type constants_RendererType = RendererType;
type constants_SceneEffect = SceneEffect;
declare const constants_SceneEffect: typeof SceneEffect;
type constants_StrokeCap = StrokeCap;
declare const constants_StrokeCap: typeof StrokeCap;
type constants_StrokeJoin = StrokeJoin;
declare const constants_StrokeJoin: typeof StrokeJoin;
type constants_TextWrapMode = TextWrapMode;
declare const constants_TextWrapMode: typeof TextWrapMode;
declare namespace constants {
  export { constants_BlendMethod as BlendMethod, constants_ColorSpace as ColorSpace, constants_EngineOption as EngineOption, constants_FillRule as FillRule, constants_FilterMethod as FilterMethod, constants_GradientSpread as GradientSpread, constants_MaskMethod as MaskMethod, constants_PathCommand as PathCommand, constants_SceneEffect as SceneEffect, constants_StrokeCap as StrokeCap, constants_StrokeJoin as StrokeJoin, constants_TextWrapMode as TextWrapMode };
  export type { constants_CanvasTarget as CanvasTarget, constants_MimeType as MimeType, constants_RendererType as RendererType };
}

/**
 * Load and render images and vector files
 * @category Picture
 */

/**
 * Callback that resolves an external asset (image or font) referenced by a
 * loaded picture, such as the assets inside a Lottie file.
 *
 * The callback is invoked synchronously during {@link Picture.load} for each
 * external reference, so any data it needs must already be in memory — fetch
 * and cache assets before loading, then resolve them here.
 *
 * @param paint - The paint that needs the asset. A {@link Picture} for an image
 *                reference, or a `Text` for a font reference. Use `instanceof`
 *                to tell them apart.
 * @param src - The asset source string exactly as authored in the file.
 * @returns `true` if you resolved the asset; `false` to let the engine fall
 *          back to its own resolution.
 *
 * @category Picture
 *
 * @beta
 */
type AssetResolver = (paint: Paint, src: string) => boolean;
/**
 * @category Picture
 */
interface LoadDataOptions {
    /** MIME type or format hint (e.g., 'svg', 'png', 'jpg', 'raw') */
    type?: MimeType;
    /** Width of raw image (required for type='raw') */
    width?: number;
    /** Height of raw image (required for type='raw') */
    height?: number;
    /** Color space of raw image (required for type='raw', default: ColorSpace.ARGB8888) */
    colorSpace?: ColorSpace;
}
/**
 * @category Picture
 */
interface PictureSize {
    width: number;
    height: number;
}
/**
 * Picture class for loading and displaying images and vector graphics
 * @category Picture
 *
 * @example
 * ```typescript
 * // Loading an SVG image
 * const picture = new TVG.Picture();
 *
 * fetch('/images/logo.svg')
 *   .then(res => res.text())
 *   .then(svgData => {
 *     picture.load(svgData, { type: 'svg' });
 *     const size = picture.size();
 *     picture.size(200, 200 * size.height / size.width); // Scale
 *     canvas.add(picture).render();
 *   });
 * ```
 *
 * @example
 * ```typescript
 * // Loading a Lottie animation as static image
 * const picture = new TVG.Picture();
 *
 * fetch('/animations/loading.json')
 *   .then(res => res.text())
 *   .then(lottieData => {
 *     picture.load(lottieData, { type: 'lottie' });
 *     picture.translate(400, 300);
 *     canvas.add(picture);
 *   });
 * ```
 */
declare class Picture extends Paint {
    #private;
    constructor();
    protected _createInstance(ptr: number): Picture;
    /**
     * Whether accessible mode is enabled.
     *
     * In accessible mode the picture retains an internal map of ID-accessible asset nodes
     * (such as named SVG nodes), which makes {@link paint} lookups more efficient and is
     * required for `Accessor.name()` to resolve names.
     *
     * @remarks
     * Must be set **before** {@link load} — the flag is consumed while the asset is parsed,
     * so enabling it afterwards has no effect on already-loaded content.
     *
     * @example
     * ```typescript
     * const picture = new TVG.Picture();
     * picture.accessible = true;
     * picture.load(svgData, { type: 'svg' });
     *
     * const accessor = new TVG.Accessor();
     * accessor.set(picture, (paint) => {
     *   console.log(accessor.name(paint.id));
     *   return true;
     * });
     * ```
     */
    get accessible(): boolean;
    set accessible(value: boolean);
    /**
     * Set a resolver for external assets (images, fonts) referenced by the picture.
     *
     * Set this BEFORE calling {@link load} — the resolver runs during load, once
     * per external reference, and setting it afterwards has no effect on assets
     * that were already resolved. Pass `null` to remove a previously set resolver.
     *
     * @param callback - The resolver, or `null` to unset.
     *
     * @example
     * ```typescript
     * // Resolve a Lottie image asset from prefetched bytes
     * const logo = new Uint8Array(await (await fetch('/logo.png')).arrayBuffer());
     *
     * const animation = new TVG.LottieAnimation();
     * animation.picture.resolver((paint, src) => {
     *   if (paint instanceof TVG.Picture) {
     *     paint.load(logo, { type: 'png' });
     *     return true;
     *   }
     *   return false;
     * });
     * animation.load(lottieData);
     * ```
     *
     * @see {@link AssetResolver}
     *
     * @beta
     */
    resolver(callback: AssetResolver | null): this;
    dispose(): void;
    /**
     * Load picture from raw data (Uint8Array or string for SVG)
     * @param data - Raw image data as Uint8Array or SVG string
     * @param options - Load options including type hint
     */
    load(data: Uint8Array | string, options?: LoadDataOptions): this;
    /**
     * Set the size of the picture (scales it)
     * @param width - Target width
     * @param height - Target height
     */
    size(width: number, height: number): this;
    /**
     * Get the current size of the picture
     */
    size(): PictureSize;
    /**
     * Set the normalized origin point of the picture.
     *
     * The origin becomes the reference point for positioning the picture on the canvas.
     * For example, setting the origin to (0.5, 0.5) moves the visual center of the picture
     * to the position specified by translate().
     * - (0, 0) = top-left corner
     * - (0.5, 0.5) = center
     * - (1, 1) = bottom-right corner
     *
     * @param x - Normalized X coordinate (0.0 to 1.0)
     * @param y - Normalized Y coordinate (0.0 to 1.0)
     *
     * @example
     * ```typescript
     * const picture = new TVG.Picture();
     * picture.load(svgData, { type: 'svg' });
     *
     * // Set origin to center for rotation around center
     * picture.origin(0.5, 0.5);
     * picture.translate(300, 300);
     * picture.rotate(45);
     * ```
     */
    origin(x: number, y: number): this;
    /**
     * Retrieve a paint object from this picture's scene tree by ID.
     *
     * @param id - A numeric hash ID or a string name (which will be hashed via Accessor.id)
     * @returns The matching Paint object, or null if not found
     *
     * @remarks
     * The returned Paint is owned by this Picture — do not dispose it manually.
     */
    paint(id: number): Paint | null;
    paint(name: string): Paint | null;
    /**
     * Set the image filtering method used when this picture is scaled or transformed.
     *
     * @param method - The filtering method to apply (default: FilterMethod.Bilinear)
     *
     * @example
     * ```typescript
     * // Keep hard pixel edges when upscaling pixel art
     * picture.filter(TVG.FilterMethod.Nearest);
     * picture.size(256, 256);
     * ```
     */
    filter(method?: FilterMethod): this;
}

/**
 * Canvas Rendering context for ThorVG
 *
 * The Canvas class manages the rendering context and provides methods for drawing
 * vector graphics to an HTML canvas element. It supports multiple rendering backends
 * (Software, WebGL, WebGPU) and handles the render loop.
 *
 * @category Canvas
 *
 * @example
 * Basic usage
 * ```typescript
 * const TVG = await ThorVG.init({ renderer: 'gl' });
 * const canvas = new TVG.Canvas('#canvas', {
 *   width: 800,
 *   height: 600
 * });
 *
 * const shape = new TVG.Shape();
 * shape.appendCircle(400, 300, 100)
 *      .fill(255, 0, 0, 255);
 *
 * canvas.add(shape).render();
 * ```
 *
 * @example
 * Rendering with animation loop
 * ```typescript
 * const canvas = new TVG.Canvas('#canvas');
 * const animation = new TVG.Animation();
 * await animation.load(lottieData);
 *
 * canvas.add(animation.picture);
 *
 * function animate() {
 *   animation.frame(currentFrame++);
 *   canvas.update().render();
 *   requestAnimationFrame(animate);
 * }
 * animate();
 * ```
 */

/**
 * Configuration options for Canvas initialization.
 *
 * @category Canvas
 */
interface CanvasOptions {
    /** Canvas width in pixels. Default: 800 */
    width?: number;
    /** Canvas height in pixels. Default: 600 */
    height?: number;
    /** Enable device pixel ratio for high-DPI displays. Default: true */
    enableDevicePixelRatio?: boolean;
    /** Rendering engine behavior option. Default: EngineOption.Default */
    engineOption?: EngineOption;
}
/**
 * Canvas rendering context for ThorVG vector graphics.
 *
 * Manages the rendering pipeline and provides methods for adding/removing Paint objects
 * and controlling the render loop.
 *
 * @category Canvas
 *
 * @example
 * ```typescript
 * // Initialize with renderer
 * const TVG = await ThorVG.init({ renderer: 'gl' });
 *
 * // Basic canvas setup with shapes
 * const canvas = new TVG.Canvas('#canvas', { width: 800, height: 600 });
 *
 * const shape = new TVG.Shape();
 * shape.appendRect(100, 100, 200, 150, 10)
 *      .fill(255, 100, 50, 255);
 *
 * canvas.add(shape).render();
 * ```
 *
 * @example
 * ```typescript
 * // Animation loop
 * const canvas = new TVG.Canvas('#canvas');
 * const shape = new TVG.Shape();
 *
 * let rotation = 0;
 * function animate() {
 *   shape.reset()
 *        .appendRect(0, 0, 100, 100)
 *        .fill(100, 150, 255, 255)
 *        .rotate(rotation++)
 *        .translate(400, 300);
 *
 *   canvas.update().render();
 *   requestAnimationFrame(animate);
 * }
 * animate();
 * ```
 */
declare class Canvas {
    #private;
    /**
     * Creates a new Canvas rendering context.
     *
     * The renderer is determined by the global setting from ThorVG.init().
     *
     * @param target - CSS selector for the target HTML canvas element (e.g., '#canvas', '.my-canvas'),
     *                 the `HTMLCanvasElement` itself, or an `OffscreenCanvas`
     * @param options - Configuration options for the canvas
     *
     * @throws {Error} If the canvas element is not found or renderer initialization fails
     *
     * @example
     * ```typescript
     * // Initialize with renderer
     * const TVG = await ThorVG.init({ renderer: 'gl' });
     *
     * // Basic canvas with default options (DPR enabled by default)
     * const canvas = new TVG.Canvas('#canvas');
     * ```
     *
     * @example
     * ```typescript
     * // Canvas with custom size
     * const TVG = await ThorVG.init({ renderer: 'wg' });
     * const canvas = new TVG.Canvas('#myCanvas', {
     *   width: 1920,
     *   height: 1080
     * });
     * ```
     *
     * @example
     * ```typescript
     * // Canvas with DPR disabled for consistent rendering across devices
     * const canvas = new TVG.Canvas('#canvas', {
     *   width: 800,
     *   height: 600,
     *   enableDevicePixelRatio: false
     * });
     * ```
     *
     * @example
     * ```typescript
     * // Enable smart (partial) rendering (SW renderer)
     * const TVG = await ThorVG.init({ renderer: 'sw' });
     * const canvas = new TVG.Canvas('#canvas', {
     *   engineOption: TVG.EngineOption.SmartRender
     * });
     * ```
     */
    constructor(target: string | CanvasTarget, options?: CanvasOptions);
    /**
     * Adds a Paint object to the canvas for rendering.
     *
     * Paint objects include Shape, Scene, Picture, Text, and Animation.picture.
     * Objects are rendered in the order they are added (painter's algorithm).
     *
     * @param paint - A Paint object to add to the canvas
     * @returns The canvas instance for method chaining
     *
     * @example
     * ```typescript
     * const shape = new TVG.Shape();
     * const text = new TVG.Text();
     * canvas.add(shape);
     * canvas.add(text);
     * ```
     *
     * @example
     * ```typescript
     * // Method chaining
     * canvas.add(shape1)
     *       .add(shape2)
     *       .render();
     * ```
     */
    add(paint: Paint | Video): this;
    /**
     * Removes one or all Paint objects from the canvas.
     *
     * @param paint - Optional Paint object to remove. If omitted, removes all Paint objects.
     * @returns The canvas instance for method chaining
     *
     * @example
     * ```typescript
     * // Remove a specific paint
     * canvas.remove(shape);
     * ```
     *
     * @example
     * ```typescript
     * // Remove all paints
     * canvas.remove();
     * ```
     */
    remove(paint?: Paint | Video): this;
    /**
     * Clears all Paint objects from the canvas and renders an empty frame.
     *
     * This is equivalent to {@link remove | remove()} without arguments,
     * but also immediately renders the cleared canvas.
     *
     * @returns The canvas instance for method chaining
     *
     * @example
     * ```typescript
     * canvas.clear(); // Clears and renders empty canvas
     * ```
     */
    clear(): this;
    /**
     * Updates the canvas state before rendering.
     *
     * This method should be called before {@link render} when working with animations
     * or when Paint objects have been modified. It ensures all transformations and
     * changes are processed.
     *
     * @returns The canvas instance for method chaining
     *
     * @example
     * ```typescript
     * // Animation loop pattern
     * function animate() {
     *   animation.frame(currentFrame++);
     *   canvas.update().render();
     *   requestAnimationFrame(animate);
     * }
     * ```
     *
     * @remarks
     * For static scenes, calling {@link render} alone is sufficient.
     * For animated content, always call update() before render().
     */
    update(): this;
    /**
     * Renders all Paint objects to the canvas.
     *
     * This method draws all added Paint objects to the canvas using the configured
     * rendering backend (Software, WebGL, or WebGPU).
     *
     * @returns The canvas instance for method chaining
     *
     * @example
     * ```typescript
     * // Static rendering
     * canvas.add(shape).add(text).render();
     * ```
     *
     * @example
     * ```typescript
     * // Animation loop
     * function animate() {
     *   canvas.update().render();
     *   requestAnimationFrame(animate);
     * }
     * ```
     *
     * @remarks
     * For animated content, call {@link update} before render().
     * For static scenes, render() can be called directly.
     */
    render(): this;
    /**
     * Resizes the canvas to new dimensions.
     *
     * @param width - New width in pixels
     * @param height - New height in pixels
     * @returns The canvas instance for method chaining
     *
     * @example
     * ```typescript
     * canvas.resize(1920, 1080).render();
     * ```
     *
     * @example
     * ```typescript
     * // Responsive canvas
     * window.addEventListener('resize', () => {
     *   canvas.resize(window.innerWidth, window.innerHeight).render();
     * });
     * ```
     */
    resize(width: number, height: number): this;
    /**
     * Sets the viewport for rendering a specific region of the canvas.
     *
     * The viewport defines the rectangular region where rendering occurs.
     * Useful for rendering to a portion of the canvas or implementing split-screen views.
     *
     * @param x - X coordinate of the viewport origin
     * @param y - Y coordinate of the viewport origin
     * @param w - Viewport width
     * @param h - Viewport height
     * @returns The canvas instance for method chaining
     *
     * @example
     * ```typescript
     * // Render to top-left quarter of canvas
     * canvas.viewport(0, 0, canvas.width / 2, canvas.height / 2);
     * ```
     */
    viewport(x: number, y: number, w: number, h: number): this;
    /**
     * Destroys the canvas and frees its WASM memory.
     *
     * After calling destroy(), this canvas instance cannot be used.
     * The ThorVG module remains loaded and new canvases can be created.
     *
     * @example
     * ```typescript
     * canvas.destroy();
     * // Create a new canvas
     * const newCanvas = new TVG.Canvas('#canvas');
     * ```
     *
     * @remarks
     * This method should be called when you're done with a canvas to free memory.
     * It's particularly important in single-page applications where canvases
     * may be created and destroyed frequently.
     */
    destroy(): void;
    /**
     * Gets the rendering backend type currently in use.
     *
     * @returns The renderer type: 'sw' (Software), 'gl' (WebGL), or 'wg' (WebGPU)
     *
     * @example
     * ```typescript
     * const canvas = new TVG.Canvas('#canvas', { renderer: 'wg' });
     * console.log(canvas.renderer); // 'wg'
     * ```
     */
    get renderer(): string;
    /**
     * Gets the current device pixel ratio applied to this canvas.
     *
     * ThorVG uses an optimized DPR formula for best performance:
     * `1 + ((window.devicePixelRatio - 1) * 0.75)`
     *
     * This provides a balance between visual quality and rendering performance,
     * especially on high-DPI displays.
     *
     * @category Canvas
     * @returns The current effective DPR value, or 1.0 if DPR scaling is disabled
     *
     * @example
     * ```typescript
     * // Getting the current DPR
     * const canvas = new TVG.Canvas('#canvas', {
     *   enableDevicePixelRatio: true
     * });
     *
     * console.log(canvas.dpr); // e.g., 1.75 on a 2x display
     * console.log(window.devicePixelRatio); // e.g., 2.0
     * ```
     *
     * @example
     * ```typescript
     * // Using DPR for responsive calculations
     * const canvas = new TVG.Canvas('#canvas');
     * const shape = new TVG.Shape();
     *
     * // Adjust stroke width based on DPR for consistent appearance
     * const strokeWidth = 2 / canvas.dpr;
     * shape.appendCircle(100, 100, 50)
     *      .stroke(255, 0, 0, 255)
     *      .strokeWidth(strokeWidth);
     * ```
     *
     * @see {@link CanvasOptions.enableDevicePixelRatio} for controlling DPR scaling
     */
    get dpr(): number;
}

/**
 * Load and control Lottie animations
 * @category Animation
 */

/**
 * @category Animation
 */
interface AnimationInfo {
    totalFrames: number;
    duration: number;
    fps: number;
}
/**
 * @category Animation
 */
interface AnimationSegment {
    start: number;
    end: number;
}
/**
 * Animation controller for Lottie animations
 * The Animation owns a Picture internally and manages frame updates
 * @category Animation
 *
 * @example
 * ```typescript
 * // Loading and playing a Lottie animation
 * const animation = new TVG.Animation();
 *
 * fetch('/animations/loader.json')
 *   .then(res => res.text())
 *   .then(lottieData => {
 *     animation.load(lottieData);
 *     const picture = animation.picture();
 *
 *     // Center and scale animation
 *     const size = picture.size();
 *     picture.translate(400 - size.width / 2, 300 - size.height / 2);
 *
 *     canvas.add(picture);
 *     animation.play();
 *   });
 * ```
 *
 * @example
 * ```typescript
 * // Controlling animation playback
 * const animation = new TVG.Animation();
 * animation.load(lottieData);
 *
 * const info = animation.getInfo();
 * console.log(`Duration: ${info.duration}s, FPS: ${info.fps}`);
 *
 * // Play with custom loop and speed
 * animation.loop(true).play();
 *
 * // Pause after 2 seconds
 * setTimeout(() => animation.pause(), 2000);
 *
 * // Jump to specific frame
 * animation.frame(30).render();
 * ```
 *
 * @example
 * ```typescript
 * // Animation segments and callbacks
 * const animation = new TVG.Animation();
 * animation.load(lottieData);
 *
 * // Play specific segment
 * animation.segment(0, 60);
 *
 * // Listen to frame updates
 * animation.play((frame) => {
 *   console.log(`Current frame: ${frame}`);
 * });
 * ```
 *
 * @see {@link LottieAnimation} for Lottie advanced features
 */
declare class Animation extends WasmObject {
    #private;
    constructor();
    protected _cleanup(ptr: number): void;
    /**
     * Get the Picture object that contains the animation content
     * The Picture is owned by the Animation and should not be manually disposed
     */
    get picture(): Picture | null;
    /**
     * Load Lottie animation from raw data
     * @param data - Lottie JSON data as Uint8Array or string
     */
    load(data: Uint8Array | string): this;
    /**
     * Get animation information (frames, duration, fps)
     */
    info(): AnimationInfo | null;
    /**
     * Get or set the current frame
     */
    frame(): number;
    frame(frameNumber: number): this;
    /**
     * Set the playback segment (for partial playback)
     * @param begin - Segment begin frame
     * @param end - Segment end frame
     */
    segment(begin: number, end: number): this;
    /**
     * Play the animation
     * @param onFrame - Optional callback called on each frame update
     */
    play(onFrame?: (frame: number) => void): this;
    /**
     * Pause the animation
     */
    pause(): this;
    /**
     * Stop the animation and reset to frame 0
     */
    stop(): this;
    /**
     * Check if animation is currently playing
     */
    isPlaying(): boolean;
    /**
     * Set whether animation should loop
     */
    setLoop(loop: boolean): this;
    /**
     * Get loop status
     */
    getLoop(): boolean;
    /**
     * Seek to a specific time (in seconds)
     */
    seek(time: number): this;
    /**
     * Get current time (in seconds)
     */
    getCurrentTime(): number;
    /**
     * Manually dispose of this animation and free its WASM memory
     */
    dispose(): void;
}

/**
 * Control advanced Lottie features on top of Animation
 * @category LottieAnimation
 */

/**
 * Lottie slot data, keyed by the `sid` the Lottie exposes.
 *
 * @category LottieAnimation
 * @see {@link LottieAnimation.gen}
 *
 * @example
 * ```typescript
 * const slot: LottieSlotData = {
 *   ball_col: { p: { a: 0, k: [0, 1, 0, 1] } },
 * };
 * ```
 */
type LottieSlotData = Record<string, unknown>;
/**
 * A named frame range embedded in the Lottie file at design time.
 * @category LottieAnimation
 * @see {@link LottieAnimation.marker}
 */
interface LottieMarker {
    /** The marker name, as authored in the Lottie file */
    name: string;
    /** Starting frame of the marker */
    begin: number;
    /** Ending frame of the marker */
    end: number;
}
/**
 * Describes the current state of a Lottie audio layer.
 *
 * This structure is provided to the audio resolver callback and contains
 * the information required to synchronize audio playback with the animation
 * timeline.
 *
 * @category LottieAnimation
 * @see {@link AudioResolver}
 * @beta
 */
interface AudioInfo {
    /** Audio source: a file path/URL, or the embedded raw bytes. */
    src: string | Uint8Array;
    /** MIME type string; valid when the source is embedded; may be `null`. */
    mimeType: string | null;
    /** Position within the audio file in seconds; valid when `active`. */
    offset: number;
    /** Volume [0, 1]; valid when `active`. */
    volume: number;
    /** `true` while the layer is within its playback range. */
    active: boolean;
}
/**
 * Audio resolver callback
 *
 * @param info - Current state of the audio layer.
 *
 * @category LottieAnimation
 * @beta
 */
type AudioResolver = (info: AudioInfo) => void;
/**
 * Animation controller with the Lottie extensions: markers, slots, etc.
 *
 * Extends {@link Animation}, so loading and playback work identically.
 *
 * @category LottieAnimation
 *
 * @example
 * ```typescript
 * // Play a named range (Marker)
 * const animation = new TVG.LottieAnimation();
 * animation.load(lottieData);
 * canvas.add(animation.picture);
 *
 * animation.segment('walk-cycle');
 * animation.play(() => canvas.update().render());
 * ```
 *
 * @example
 * ```typescript
 * // Override a property of the Lottie (Slot)
 * const animation = new TVG.LottieAnimation();
 * animation.load(lottieData);
 *
 * const id = animation.gen({
 *   ball_col: { p: { a: 0, k: [0, 1, 0, 1] } },
 * });
 * animation.apply(id);
 * canvas.update().render();
 * ```
 */
declare class LottieAnimation extends Animation {
    #private;
    constructor();
    /**
     * Load Lottie animation from raw data
     * @param data - Lottie JSON data as Uint8Array or string
     */
    load(data: Uint8Array | string): this;
    /**
     * Get or set the current frame
     */
    frame(): number;
    frame(frameNumber: number): this;
    /**
     * Play the animation
     * @param onFrame - Optional callback called on each frame update
     */
    play(onFrame?: (frame: number) => void): this;
    /**
     * Pause the animation
     */
    pause(): this;
    /**
     * Set the playback segment by marker name.
     *
     * Markers are designated at the design level, so the caller must know the
     * marker name in advance. Setting a marker discards any previously set segment.
     *
     * @param marker - The marker name, or `null` to reset to the full timeline
     *
     * @example
     * ```typescript
     * animation.segment('walk-cycle').play();
     * animation.segment(null); // back to the whole animation
     * ```
     */
    segment(marker: string | null): this;
    /**
     * Set the playback segment (for partial playback)
     * @param begin - Segment begin frame
     * @param end - Segment end frame
     */
    segment(begin: number, end: number): this;
    /**
     * Get the number of markers in the loaded animation
     * @returns The marker count, or 0 if the animation has no markers
     */
    markersCnt(): number;
    /**
     * Get the name and frame range of a marker by index
     * @param idx - Zero-based marker index
     * @returns The marker, or null if the index is out of range
     *
     * @example
     * ```typescript
     * for (let i = 0; i < animation.markersCnt(); i++) {
     *   const marker = animation.marker(i);
     *   console.log(`${marker.name}: ${marker.begin} - ${marker.end}`);
     * }
     * ```
     */
    marker(idx: number): LottieMarker | null;
    /**
     * Generate a slot from Lottie slot data, for overriding animation properties
     *
     * @param slot - The slot data. Pass an object and it is serialized for you, or a
     *               raw JSON string to hand through untouched - useful when the data
     *               already arrives as text.
     * @returns A non-zero slot ID on success
     *
     * @remarks
     * The slot format requires each entry to wrap its value in `p`. An entry without
     * it parses to an empty property, so `gen()` still returns a valid ID but the
     * override does nothing.
     *
     * @example
     * ```typescript
     * const id = animation.gen({
     *   fill_color: { p: { a: 0, k: [1, 0, 0] } },
     * });
     * animation.apply(id);
     * ```
     *
     * @see {@link apply}
     * @see {@link del}
     */
    gen(slot: LottieSlotData | string): number;
    /**
     * Apply a previously generated slot to the animation
     * @param id - The slot ID from {@link gen}, or 0 to reset all applied slots
     */
    apply(id: number): this;
    /**
     * Delete a previously generated slot
     * @param id - The slot ID from {@link gen}
     */
    del(id: number): this;
    /**
     * Set the quality level for Lottie effects such as blur and shadows
     * @param value - Quality level from 0 (fastest) to 100 (best), default 50.
     *                Values outside the range are clamped.
     */
    quality(value: number): this;
    /**
     * Retrieves the master playback volume of the Lottie animation.
     * @returns The current master playback volume, otherwise 0 if the animation is not loaded.
     * @beta
     */
    volume(): number;
    /**
     * Sets the master playback volume of the Lottie animation.
     *
     * The specified volume is applied to all media assets in the animation.
     * Each media asset preserves its own volume, and the effective playback
     * volume is calculated by multiplying the master volume by the media
     * asset's volume.
     *
     * A value of 1.0 preserves the original volume.
     * A value of 0.0 mutes all media.
     * Values greater than 1.0 amplify the playback volume.
     *
     * The recommended range is [0.0, 2.0].
     *
     * @param value - Master playback volume.
     * @beta
     */
    volume(value: number): this;
    /**
     * Sets the audio resolver callback for the Lottie audio layers.
     *
     * The built-in backend stops while a resolver is set, so the resolver takes
     * on every audio layer of the animation.
     *
     * @param callback - The resolver, or `null` to hand the layers back to the
     *                   built-in backend.
     *
     * @example
     * ```typescript
     * animation.resolver((info) => {
     *   if (info.active) {
     *     //Start or seek playback of info.src.
     *   } else {
     *     //Stop playback of info.src.
     *   }
     * });
     * ```
     *
     * @see {@link AudioResolver}
     * @beta
     */
    resolver(callback: AudioResolver | null): this;
    dispose(): void;
}

/**
 * Load and control video playback
 * @category Video
 */

/**
 * Video controller.
 * The Video owns a Picture internally and manages frame updates
 * @category Video
 *
 * @example
 * ```typescript
 * const video = new TVG.Video();
 * canvas.add(video);
 *
 * const bytes = new Uint8Array(await (await fetch('/clip.mp4')).arrayBuffer());
 * await video.load(bytes);
 * video.picture?.size(800, 600);
 * video.loop(true).play();
 * ```
 *
 * @beta
 */
declare class Video {
    #private;
    canvas: Canvas | null;
    constructor();
    /**
     * Get the Picture object that contains the video frames.
     * This Picture is owned by the Video and should not be manually disposed.
     */
    get picture(): Picture | null;
    /**
     * Load video from raw data.
     *
     * @param data - Video file bytes
     * @returns A promise that resolves when the video is ready, or rejects on a decode error.
     */
    load(data: Uint8Array | ArrayBuffer): Promise<void>;
    /**
     * Start or resume playback.
     * @param onFrame - Optional callback invoked on each frame update
     */
    play(onFrame?: (time: number) => void): this;
    /** Pause playback */
    pause(): this;
    /** Stop playback and rewind to the start. */
    stop(): this;
    /** Enable or disable repeated playback. */
    loop(on: boolean): this;
    /** Seek to a specific time (in seconds) */
    seek(time: number): this;
    /** Get or set the audio volume level in the range [0.0, 1.0]. */
    volume(): number;
    volume(value: number): this;
    /** Mute or unmute the audio. */
    mute(on: boolean): this;
    /** Whether the audio is currently muted. */
    muted(): boolean;
    /** Current playback position in seconds. */
    time(): number;
    /** Total duration in seconds. */
    duration(): number;
    /** Dispose of the video, its worker and WASM resources. */
    dispose(): void;
    /**
     * Check if this object has been disposed
     */
    get isDisposed(): boolean;
}

/**
 * FinalizationRegistry instances for automatic memory management
 */

interface RegistryToken {
    ptr: number;
    cleanup: (ptr: number) => void;
}

/**
 * Base class for all WASM-backed objects
 */

declare abstract class WasmObject {
    #private;
    constructor(ptr: number, registry?: FinalizationRegistry<RegistryToken>);
    /**
     * Gets the WASM pointer for this object
     * Returns 0 if object has been disposed (error handled by global handler)
     */
    get ptr(): number;
    /**
     * Manually dispose of this object and free its WASM memory
     */
    dispose(): void;
    /**
     * Check if this object has been disposed
     */
    get isDisposed(): boolean;
    /**
     * Cleanup function to be implemented by subclasses
     * @param ptr - The WASM pointer to clean up
     */
    protected abstract _cleanup(ptr: number): void;
}

/**
 * @category Shapes
 */
interface Bounds {
    x: number;
    y: number;
    width: number;
    height: number;
}
/**
 * @category Shapes
 */
interface Point {
    x: number;
    y: number;
}
/**
 * A 3x3 transformation matrix for 2D transformations.
 *
 * The matrix elements represent:
 * - e11, e12: Rotation/scale in X
 * - e21, e22: Rotation/scale in Y
 * - e13, e23: Translation in X and Y
 * - e31, e32: Always 0 (reserved for 3D)
 * - e33: Always 1 (homogeneous coordinate)
 *
 * Matrix layout:
 * ```
 * | e11  e12  e13 |
 * | e21  e22  e23 |
 * | e31  e32  e33 |
 * ```
 *
 * @category Shapes
 */
interface Matrix {
    e11: number;
    e12: number;
    e13: number;
    e21: number;
    e22: number;
    e23: number;
    e31: number;
    e32: number;
    e33: number;
}
/**
 * Base class for all drawable objects
 * @category Paint
 */
declare abstract class Paint extends WasmObject {
    protected _cleanup(ptr: number): void;
    /**
     * The ID of this paint object.
     * IDs are used to identify paint objects within a picture's scene tree.
     * Assign a string to generate a hash ID from the name, or a number to set directly.
     */
    get id(): number;
    set id(value: number | string);
    /**
     * Translate the paint by (x, y)
     */
    translate(x: number, y: number): this;
    /**
     * Rotate the paint by angle (in degrees)
     */
    rotate(angle: number): this;
    /**
     * Scale the paint by factor
     */
    scale(factor: number): this;
    /**
     * Set the blending method for this paint.
     * Blending determines how this paint is combined with the content below it.
     *
     * @param method - The blending method to use
     * @returns The Paint instance for method chaining
     *
     * @example
     * ```typescript
     * const scene = new TVG.Scene();
     * scene.blend(BlendMethod.Add);
     *
     * const shape = new TVG.Shape();
     * shape.appendCircle(100, 100, 50, 50);
     * shape.fill(255, 0, 0, 255);
     * shape.blend(BlendMethod.Multiply);
     * ```
     */
    blend(method: BlendMethod): this;
    /**
     * Get or set the opacity (0 to 255)
     * @param value - The opacity value in the range [0 ~ 255], where 0 is completely transparent and 255 is opaque.
     * @returns When setting, returns the Paint instance for method chaining. When getting, returns the opacity value (0-255).
     *
     * @example
     * ```typescript
     * // Set opacity to 50% (half transparent)
     * shape.opacity(128);
     *
     * // Set to fully opaque
     * shape.opacity(255);
     *
     * // Get current opacity value
     * const currentOpacity = shape.opacity(); // returns 0-255
     * ```
     */
    opacity(): number;
    opacity(value: number): this;
    /**
     * Get or set the visibility
     */
    visible(): boolean;
    visible(value: boolean): this;
    /**
     * Get the axis-aligned bounding box (AABB) of this paint
     */
    bounds(): Bounds;
    /**
     * Get the oriented bounding box (OBB) of this paint as 4 corner points
     * @param options - Options object with oriented flag
     */
    bounds(options: {
        oriented: true;
    }): Point[];
    /**
     * Duplicate this paint object
     */
    duplicate<T extends Paint>(): T;
    /**
     * Applies a custom transformation matrix to the paint.
     *
     * This method allows you to apply complex transformations that combine
     * translation, rotation, scaling, and skewing in a single operation.
     * The matrix is multiplied with any existing transformations.
     *
     * @param matrix - A 3x3 transformation matrix
     * @returns The Paint instance for method chaining
     *
     * @example
     * ```typescript
     * // Apply a combined transformation
     * const shape = new TVG.Shape();
     * shape.appendRect(0, 0, 100, 100);
     *
     * // Create a matrix for: scale(2, 1.5) + rotate(45deg) + translate(100, 50)
     * const rad = (45 * Math.PI) / 180;
     * const cos = Math.cos(rad);
     * const sin = Math.sin(rad);
     *
     * shape.transform({
     *   e11: 2 * cos,   e12: -2 * sin,  e13: 100,
     *   e21: 1.5 * sin, e22: 1.5 * cos, e23: 50,
     *   e31: 0,         e32: 0,         e33: 1
     * });
     * ```
     *
     * @example
     * ```typescript
     * // Create a skew transformation
     * const shape = new TVG.Shape();
     * shape.appendRect(0, 0, 100, 100);
     *
     * // Skew in X direction
     * shape.transform({
     *   e11: 1,   e12: 0.5, e13: 0,
     *   e21: 0,   e22: 1,   e23: 0,
     *   e31: 0,   e32: 0,   e33: 1
     * });
     * ```
     */
    transform(matrix: Matrix): this;
    /**
     * Sets a clipping path for this paint object.
     *
     * The clipping path restricts the area where the paint will be rendered.
     * Only the parts of the paint that overlap with the clipper shape will be visible.
     *
     * @param clipper - A Paint object (typically a Shape) to use as the clipping path
     * @returns The Paint instance for method chaining
     *
     * @example
     * ```typescript
     * const circle = new TVG.Shape();
     * circle.appendCircle(150, 150, 100);
     *
     * const rect = new TVG.Shape();
     * rect.appendRect(0, 0, 300, 300)
     *     .fill(255, 0, 0, 255)
     *     .clip(circle);
     *
     * canvas.add(rect);
     * ```
     */
    clip(clipper: Paint): this;
    /**
     * Sets a masking target object and the masking method.
     *
     * The masking restricts the transparency of the source paint using the target paint.
     *
     * @param target - A Paint object to use as the masking target
     * @param method - The method used to mask the source object with the target
     * @returns The Paint instance for method chaining
     *
     * @example
     * ```typescript
     * const mask = new TVG.Shape();
     * mask.appendCircle(200, 200, 125);
     * mask.fill(255, 255, 255);
     *
     * const shape = new TVG.Shape();
     * shape.appendRect(0, 0, 400, 400)
     *     .fill(255, 0, 0, 255)
     *     .mask(mask, MaskMethod.Alpha);
     *
     * canvas.add(shape);
     * ```
     */
    mask(target: Paint, method: MaskMethod): this;
    /**
     * Checks whether the given rectangular region intersects the filled area of the paint.
     *
     * Useful for hit-testing, such as detecting whether a click or touch landed on a painted region.
     * The paint must have been updated by a Canvas beforehand — typically after the canvas has been
     * drawn and synchronized.
     *
     * @param x - The x-coordinate of the region's top-left corner
     * @param y - The y-coordinate of the region's top-left corner
     * @param width - The width of the region. Must be greater than 0
     * @param height - The height of the region. Must be greater than 0
     * @param visibleOnly - If true, hidden paints are excluded from the test (default: false)
     * @returns true if any part of the region intersects the filled area, false otherwise
     *
     * @remarks
     * To test a single point, set width and height to 1.
     * This test does not account for the results of blending or masking.
     *
     * @see {@link visible}
     *
     * @example
     * ```typescript
     * const shape = new TVG.Shape();
     * shape.appendRect(100, 100, 200, 200);
     * canvas.add(shape).render();
     *
     * // Check if shape intersects with a region
     * if (shape.intersects(150, 150, 100, 100)) {
     *   console.log('Shape intersects with region');
     * }
     *
     * // Hit-test a single point, ignoring hidden paints
     * if (shape.intersects(event.offsetX, event.offsetY, 1, 1, true)) {
     *   console.log('Clicked a visible part of the shape');
     * }
     * ```
     */
    intersects(x: number, y: number, width: number, height: number, visibleOnly?: boolean): boolean;
    /**
     * Create a new instance of this paint type with the given pointer
     * Must be implemented by subclasses
     */
    protected abstract _createInstance(ptr: number): Paint;
}

/**
 * Base class for gradient fills
 * @category Gradients
 */

/**
 * @category Gradients
 */
type ColorStop = readonly [number, number, number, number];
interface ColorStopEntry {
    offset: number;
    color: ColorStop;
}
declare abstract class Fill extends WasmObject {
    protected _filled: boolean;
    protected _stops: ColorStopEntry[];
    protected constructor(ptr: number);
    protected _cleanup(ptr: number): void;
    /**
     * Add a color stop to the gradient
     * @param offset - Position of the stop (0.0 to 1.0)
     * @param color - RGBA color [r, g, b, a] where each value is 0-255
     */
    addStop(offset: number, color: ColorStop): this;
    /**
     * Clear all pending color stops
     * Use this to reset stops before adding new ones
     *
     * @returns The Fill instance for method chaining
     *
     * @example
     * ```typescript
     * const gradient = new TVG.LinearGradient(0, 0, 200, 0);
     * gradient.addStop(0, [255, 0, 0, 255])
     *         .addStop(1, [0, 0, 255, 255]);
     *
     * // Change stops
     * gradient.clearStops()
     *         .addStop(0, [0, 255, 0, 255])
     *         .addStop(1, [255, 255, 0, 255]);
     *
     * shape.fill(gradient);
     * ```
     */
    clearStops(): this;
    /**
     * Replace all color stops with new ones
     * This is a convenience method that clears existing stops and adds new ones in one call
     *
     * @param stops - Variable number of [offset, color] tuples
     * @returns The Fill instance for method chaining
     *
     * @example
     * ```typescript
     * const gradient = new TVG.LinearGradient(0, 0, 200, 0);
     * gradient.setStops(
     *   [0, [255, 0, 0, 255]],      // Red at start
     *   [0.5, [255, 255, 0, 255]],  // Yellow at middle
     *   [1, [0, 255, 0, 255]]       // Green at end
     * );
     *
     * shape.fill(gradient);
     *
     * // Later, completely replace stops
     * gradient.setStops(
     *   [0, [0, 0, 255, 255]],   // Blue at start
     *   [1, [255, 0, 255, 255]]  // Magenta at end
     * );
     *
     * shape.fill(gradient);  // Re-apply with new stops
     * ```
     */
    setStops(...stops: Array<[number, ColorStop]>): this;
    /**
     * Apply collected color stops to the gradient
     * ColorStop struct: {float offset, uint8_t r, g, b, a} = 8 bytes per stop
     */
    protected _applyStops(): void;
    /**
     * Set the gradient spread method
     */
    spread(type: GradientSpread): this;
}

/**
 * Vector path drawing and manipulation
 *
 * Shape is the fundamental drawing primitive in ThorVG WebCanvas. It provides methods for
 * creating paths using moveTo/lineTo/cubicTo commands, as well as convenience methods for
 * common shapes like rectangles and circles. Shapes can be filled with solid colors or
 * gradients, and stroked with customizable line styles.
 *
 * @category Shapes
 *
 * @example
 * ```typescript
 * // Basic triangle
 * const shape = new TVG.Shape();
 * shape.moveTo(100, 50)
 *      .lineTo(150, 150)
 *      .lineTo(50, 150)
 *      .close()
 *      .fill(255, 0, 0, 255);
 * canvas.add(shape).render();
 * ```
 *
 * @example
 * ```typescript
 * // Rectangle with rounded corners
 * const rect = new TVG.Shape();
 * rect.appendRect(50, 50, 200, 100, { rx: 10, ry: 10 })
 *     .fill(0, 120, 255, 255)
 *     .stroke({ width: 3, color: [0, 0, 0, 255] });
 * ```
 *
 * @example
 * ```typescript
 * // Circle with gradient fill
 * const circle = new TVG.Shape();
 * const gradient = new TVG.RadialGradient(150, 150, 50);
 * gradient.addStop(0, [255, 255, 255, 255])
 *         .addStop(1, [0, 100, 255, 255]);
 *
 * circle.appendCircle(150, 150, 50)
 *       .fill(gradient);
 * ```
 *
 * @example
 * ```typescript
 * // Complex path with bezier curves
 * const shape = new TVG.Shape();
 * shape.moveTo(50, 100)
 *      .cubicTo(50, 50, 150, 50, 150, 100)
 *      .cubicTo(150, 150, 50, 150, 50, 100)
 *      .close()
 *      .fill(255, 100, 0, 255);
 * ```
 */

/**
 * Options for creating rectangles with rounded corners.
 *
 * @category Shapes
 */
interface RectOptions {
    /** Horizontal corner radius. Default: 0 */
    rx?: number;
    /** Vertical corner radius. Default: 0 */
    ry?: number;
    /** Path direction. true = clockwise, false = counter-clockwise. Default: true */
    clockwise?: boolean;
}
/**
 * Comprehensive stroke styling options.
 *
 * @category Shapes
 */
interface StrokeOptions {
    /** Stroke width in pixels */
    width?: number;
    /** Stroke color as [r, g, b, a] with values 0-255. Alpha is optional, defaults to 255. */
    color?: readonly [number, number, number, number?];
    /** Gradient fill for the stroke */
    gradient?: Fill;
    /** Line cap style: StrokeCap.Butt, StrokeCap.Round, or StrokeCap.Square. Default: StrokeCap.Butt */
    cap?: StrokeCap;
    /** Line join style: StrokeJoin.Miter, StrokeJoin.Round, or StrokeJoin.Bevel. Default: StrokeJoin.Miter */
    join?: StrokeJoin;
    /** Miter limit for 'miter' joins. Default: 4 */
    miterLimit?: number;
    /** Dash pattern as array of dash/gap lengths. Empty array [] resets to solid line. */
    dash?: number[];
    /** Dash pattern offset. Use with dash to shift pattern start position. */
    dashOffset?: number;
}
/**
 * Shape class for creating and manipulating vector graphics paths.
 *
 * Extends {@link Paint} to inherit transformation and opacity methods.
 *
 * @category Shapes
 *
 * @example
 * ```typescript
 * // Drawing basic shapes
 * const shape = new TVG.Shape();
 *
 * // Rectangle with rounded corners
 * shape.appendRect(50, 50, 200, 100, 10)
 *      .fill(255, 100, 100, 255)
 *      .stroke(50, 50, 50, 255, 2);
 *
 * canvas.add(shape);
 * ```
 *
 * @example
 * ```typescript
 * // Drawing paths with gradients
 * const shape = new TVG.Shape();
 * shape.moveTo(100, 100)
 *      .lineTo(200, 150)
 *      .lineTo(150, 250)
 *      .close();
 *
 * const gradient = new TVG.LinearGradient(100, 100, 200, 250);
 * gradient.addStop(0, [255, 0, 0, 255])
 *         .addStop(1, [0, 0, 255, 255]);
 *
 * shape.fillGradient(gradient);
 * canvas.add(shape);
 * ```
 *
 * @example
 * ```typescript
 * // Complex path with transformations
 * const shape = new TVG.Shape();
 * shape.appendCircle(0, 0, 50)
 *      .fill(100, 200, 255, 255)
 *      .translate(400, 300)
 *      .scale(1.5)
 *      .rotate(45);
 *
 * canvas.add(shape);
 * ```
 */
declare class Shape extends Paint {
    constructor();
    protected _createInstance(ptr: number): Shape;
    /**
     * Moves the path cursor to a new point without drawing.
     *
     * This starts a new subpath at the specified coordinates. Subsequent drawing commands
     * will start from this point.
     *
     * @param x - X coordinate
     * @param y - Y coordinate
     * @returns The Shape instance for method chaining
     *
     * @example
     * ```typescript
     * shape.moveTo(100, 100)
     *      .lineTo(200, 200);
     * ```
     */
    moveTo(x: number, y: number): this;
    /**
     * Draws a straight line from the current point to the specified coordinates.
     *
     * @param x - End X coordinate
     * @param y - End Y coordinate
     * @returns The Shape instance for method chaining
     *
     * @example
     * ```typescript
     * // Draw a triangle
     * shape.moveTo(100, 50)
     *      .lineTo(150, 150)
     *      .lineTo(50, 150)
     *      .close();
     * ```
     */
    lineTo(x: number, y: number): this;
    /**
     * Draws a cubic Bézier curve from the current point to (x, y).
     *
     * @param cx1 - X coordinate of first control point
     * @param cy1 - Y coordinate of first control point
     * @param cx2 - X coordinate of second control point
     * @param cy2 - Y coordinate of second control point
     * @param x - End X coordinate
     * @param y - End Y coordinate
     * @returns The Shape instance for method chaining
     *
     * @example
     * ```typescript
     * // Draw a smooth curve
     * shape.moveTo(50, 100)
     *      .cubicTo(50, 50, 150, 50, 150, 100);
     * ```
     */
    cubicTo(cx1: number, cy1: number, cx2: number, cy2: number, x: number, y: number): this;
    /**
     * Closes the current subpath by drawing a straight line back to the starting point.
     *
     * @returns The Shape instance for method chaining
     *
     * @example
     * ```typescript
     * shape.moveTo(100, 50)
     *      .lineTo(150, 150)
     *      .lineTo(50, 150)
     *      .close(); // Completes the triangle
     * ```
     */
    close(): this;
    /**
     * Appends a rectangle path to the shape.
     *
     * Creates a rectangular path with optional rounded corners. Multiple rectangles
     * can be added to the same shape.
     *
     * @param x - X coordinate of the top-left corner
     * @param y - Y coordinate of the top-left corner
     * @param w - Width of the rectangle
     * @param h - Height of the rectangle
     * @param options - Optional corner rounding and path direction
     * @returns The Shape instance for method chaining
     *
     * @example
     * ```typescript
     * // Simple rectangle
     * shape.appendRect(50, 50, 200, 100);
     * ```
     *
     * @example
     * ```typescript
     * // Rounded rectangle
     * shape.appendRect(50, 50, 200, 100, { rx: 10, ry: 10 });
     * ```
     */
    appendRect(x: number, y: number, w: number, h: number, options?: RectOptions): this;
    /**
     * Appends a circle or ellipse path to the shape.
     *
     * Creates a circular or elliptical path. If only one radius is provided,
     * creates a perfect circle. If two radii are provided, creates an ellipse.
     *
     * @param cx - X coordinate of the center
     * @param cy - Y coordinate of the center
     * @param rx - Horizontal radius
     * @param ry - Vertical radius (defaults to rx for perfect circle)
     * @param clockwise - Path direction. Default: true
     * @returns The Shape instance for method chaining
     *
     * @example
     * ```typescript
     * // Perfect circle
     * shape.appendCircle(150, 150, 50)
     *      .fill(255, 0, 0, 255);
     * ```
     *
     * @example
     * ```typescript
     * // Ellipse
     * shape.appendCircle(150, 150, 80, 50)
     *      .fill(0, 100, 255, 255);
     * ```
     */
    appendCircle(cx: number, cy: number, rx: number, ry?: number, clockwise?: boolean): this;
    /**
     * Appends a pre-built path to the shape from raw command and point arrays.
     *
     * This is the low-level counterpart to {@link moveTo}, {@link lineTo}, {@link cubicTo}
     * and {@link close}. It lets you feed an entire path in a single call, which is useful
     * when the path data already exists in command/point form (e.g. imported from another
     * source or produced by {@link path}).
     *
     * Each command consumes points from `points` in order:
     * - {@link PathCommand.MoveTo} / {@link PathCommand.LineTo}: 1 point
     * - {@link PathCommand.CubicTo}: 3 points (control1, control2, end)
     * - {@link PathCommand.Close}: 0 points
     *
     * The total number of points consumed by `commands` must equal `points.length`.
     *
     * @param commands - Path commands describing the outline
     * @param points - Points as `[x, y]` pairs, consumed in order by the commands
     * @returns The Shape instance for method chaining
     *
     * @example
     * ```typescript
     * // Build a triangle in one call
     * shape.appendPath(
     *   [PathCommand.MoveTo, PathCommand.LineTo, PathCommand.LineTo, PathCommand.Close],
     *   [[100, 50], [150, 150], [50, 150]]
     * ).fill(255, 0, 0, 255);
     * ```
     */
    appendPath(commands: readonly PathCommand[], points: ReadonlyArray<readonly number[]>): this;
    /**
     * Retrieves the shape's current path as command and point arrays.
     *
     * Returns a snapshot of the path data accumulated by the path-building methods
     * (or {@link appendPath}). The returned arrays are copies and can be safely
     * modified and fed back into {@link appendPath}.
     *
     * Mirrors the native `Shape::path()` getter.
     *
     * @returns An object with `commands` (path commands) and `points` ([x, y] tuples)
     *
     * @example
     * ```typescript
     * const { commands, points } = shape.path();
     * // Re-append the same outline to another shape
     * other.appendPath(commands, points);
     * ```
     */
    path(): {
        commands: PathCommand[];
        points: Array<[number, number]>;
    };
    /**
     * Sets the fill rule for the shape.
     *
     * The fill rule determines how the interior of a shape is calculated when the path
     * intersects itself or when multiple subpaths overlap.
     *
     * @param rule - Fill rule: 'winding' (non-zero) or 'evenodd'
     * @returns The Shape instance for method chaining
     *
     * @example
     * ```typescript
     * const star = new TVG.Shape();
     * // Draw a self-intersecting star
     * star.moveTo(100, 10)
     *     .lineTo(40, 180)
     *     .lineTo(190, 60)
     *     .lineTo(10, 60)
     *     .lineTo(160, 180)
     *     .close()
     *     .fillRule(FillRule.EvenOdd)  // Use even-odd rule for star shape
     *     .fill(255, 200, 0, 255);
     * ```
     */
    fillRule(rule: FillRule): this;
    /**
     * Sets the trim of the shape along the defined path segment, controlling which part is visible.
     *
     * This method allows you to trim/cut paths, showing only a portion from the begin to end point.
     * This is particularly useful for animations (e.g., drawing a line progressively) or creating
     * partial shapes like arcs from circles.
     *
     * If the values exceed the 0-1 range, they wrap around (similar to angle wrapping).
     *
     * @param begin - Start of the segment to display (0.0 to 1.0, where 0 is the path start)
     * @param end - End of the segment to display (0.0 to 1.0, where 1 is the path end)
     * @param simultaneous - How to handle multiple paths within the shape:
     *   - `true` (default): Trimming applied simultaneously to all paths
     *   - `false`: All paths treated as one entity with combined length
     * @returns The Shape instance for method chaining
     *
     * @example
     * ```typescript
     * // Draw half a circle (arc)
     * const arc = new TVG.Shape();
     * arc.appendCircle(150, 150, 100)
     *    .trimPath(0, 0.5)  // Show only first half
     *    .stroke({ width: 5, color: [255, 0, 0, 255] });
     * ```
     *
     * @example
     * ```typescript
     * // Animated line drawing effect
     * const line = new TVG.Shape();
     * line.moveTo(50, 100)
     *     .lineTo(250, 100)
     *     .trimPath(0, progress)  // progress from 0 to 1
     *     .stroke({ width: 3, color: [0, 100, 255, 255] });
     * ```
     *
     * @example
     * ```typescript
     * // Trim multiple paths separately
     * const shape = new TVG.Shape();
     * shape.appendRect(50, 50, 100, 100)
     *      .appendCircle(200, 100, 50)
     *      .trimPath(0.25, 0.75, true)  // Trim each path separately
     *      .stroke({ width: 2, color: [0, 0, 0, 255] });
     * ```
     */
    trimPath(begin: number, end: number, simultaneous?: boolean): this;
    /**
     * Sets the fill for the shape with a gradient.
     *
     * @param gradient - LinearGradient, RadialGradient or ConicGradient to use as fill
     * @returns The Shape instance for method chaining
     */
    fill(gradient: Fill): this;
    /**
     * Sets the fill for the shape with a solid color.
     *
     * @param r - Red component (0-255)
     * @param g - Green component (0-255)
     * @param b - Blue component (0-255)
     * @param a - Alpha component (0-255). Default: 255 (opaque)
     * @returns The Shape instance for method chaining
     */
    fill(r: number, g: number, b: number, a?: number): this;
    /**
     * Sets the stroke width for the shape.
     *
     * @param width - Stroke width in pixels
     * @returns The Shape instance for method chaining
     */
    stroke(width: number): this;
    /**
     * Sets comprehensive stroke styling options for the shape.
     *
     * @param options - Stroke configuration including width, color, gradient, caps, joins, and miter limit
     * @returns The Shape instance for method chaining
     */
    stroke(options: StrokeOptions): this;
    /**
     * Sets the rendering order of the shape's stroke and fill.
     *
     * By default the fill is rendered first and the stroke on top of it. Passing `true`
     * reverses this so the stroke is drawn first and the fill on top — useful when you want
     * the fill to cover the inner half of a thick stroke.
     *
     * @param strokeFirst - `true` renders the stroke before the fill; `false` (default) renders the stroke on top
     * @returns The Shape instance for method chaining
     *
     * @example
     * ```typescript
     * shape.appendCircle(150, 150, 50)
     *      .fill(255, 255, 255, 255)
     *      .stroke({ width: 20, color: [0, 0, 0, 255] })
     *      .order(true); // stroke under the fill
     * ```
     */
    order(strokeFirst: boolean): this;
    /**
     * Resets the shape's path data while retaining fill and stroke properties.
     *
     * This method clears all path commands (moveTo, lineTo, cubicTo, appendRect, etc.)
     * but preserves the shape's fill color, gradient, stroke settings, and transformations.
     * This is useful for animations where you want to redraw the path while keeping
     * the same styling.
     *
     * @returns The Shape instance for method chaining
     *
     * @example
     * ```typescript
     * // Animating shape changes while keeping styles
     * const shape = new TVG.Shape();
     * shape.appendRect(0, 0, 100, 100);
     * shape.fill(255, 0, 0, 255);
     * shape.stroke({ width: 5, color: [0, 0, 255, 255] });
     *
     * // Later, change the shape but keep the fill/stroke
     * shape.reset();
     * shape.appendCircle(50, 50, 40);
     * // Still has red fill and blue stroke!
     * ```
     */
    reset(): this;
}

/**
 * Group and manage multiple paint objects
 * @category Scene
 */

/**
 * Scene class for hierarchical grouping of Paint objects
 * @category Scene
 *
 * @example
 * ```typescript
 * // Grouping shapes in a scene
 * const scene = new TVG.Scene();
 *
 * const background = new TVG.Shape();
 * background.appendRect(0, 0, 800, 600).fill(240, 240, 240, 255);
 *
 * const circle = new TVG.Shape();
 * circle.appendCircle(100, 100, 50).fill(255, 100, 100, 255);
 *
 * scene.add(background);
 * scene.add(circle);
 * canvas.add(scene);
 * ```
 *
 * @example
 * ```typescript
 * // Scene transformations affect all children
 * const scene = new TVG.Scene();
 *
 * for (let i = 0; i < 5; i++) {
 *   const shape = new TVG.Shape();
 *   shape.appendRect(i * 60, 100, 50, 50)
 *        .fill(100 + i * 30, 150, 255 - i * 30, 255);
 *   scene.add(shape);
 * }
 *
 * // Transform entire group
 * scene.translate(200, 200).rotate(30);
 * canvas.add(scene);
 * ```
 */
declare class Scene extends Paint {
    constructor();
    protected _createInstance(ptr: number): Scene;
    /**
     * Add a paint to the scene
     */
    add(paint: Paint): this;
    /**
     * Remove paint(s) from the scene
     * If no paint is provided, removes all paints
     */
    remove(paint?: Paint): this;
    /**
     * Clear all paints from the scene (alias for remove())
     */
    clear(): this;
    /**
     * Reset all previously applied scene effects, restoring the scene to its original state.
     *
     * @returns The Scene instance for method chaining
     *
     * @example
     * ```typescript
     * const scene = new TVG.Scene();
     * scene.dropShadow(128, 128, 128, 200, 45, 5, 2, 60);
     * scene.resetEffects(); // Remove all effects
     * ```
     */
    resetEffects(): this;
    /**
     * Apply a Gaussian blur effect to the scene.
     *
     * @param sigma - Blur intensity (> 0)
     * @param direction - Blur direction: 0 (both), 1 (horizontal), 2 (vertical)
     * @param border - Reserved for border handling. Currently ignored.
     * @param quality - Blur quality (0-100)
     * @returns The Scene instance for method chaining
     *
     * @example
     * ```typescript
     * const scene = new TVG.Scene();
     * scene.add(shape1);
     * scene.add(shape2);
     * scene.gaussianBlur(1.5, 0, 0, 75); // Apply blur to entire scene
     * ```
     */
    gaussianBlur(sigma: number, direction?: number, border?: number, quality?: number): this;
    /**
     * Apply a centered linear motion blur effect to the scene.
     *
     * The blur is spread evenly on both sides of the content along the given angle.
     * The scene transform applies to the blur vector.
     *
     * @param distance - Total blur length in scene-local units (>= 0)
     * @param angle - Blur angle in degrees, measured clockwise from the positive x-axis. Default: 0
     * @param quality - Blur quality (0-100)
     * @returns The Scene instance for method chaining
     *
     * @example
     * ```typescript
     * const scene = new TVG.Scene();
     * scene.add(shape);
     * scene.motionBlur(30, 45, 75); // 30px blur along the 45° direction
     * ```
     *
     * @beta
     */
    motionBlur(distance: number, angle?: number, quality?: number): this;
    /**
     * Apply a drop shadow effect with Gaussian blur filter to the scene.
     *
     * @param r - Red component (0-255)
     * @param g - Green component (0-255)
     * @param b - Blue component (0-255)
     * @param a - Alpha/opacity (0-255)
     * @param angle - Shadow angle in degrees (0-360)
     * @param distance - Shadow distance/offset
     * @param sigma - Blur intensity for the shadow (> 0)
     * @param quality - Blur quality (0-100)
     * @returns The Scene instance for method chaining
     *
     * @example
     * ```typescript
     * const scene = new TVG.Scene();
     * scene.add(shape);
     * // Add gray drop shadow at 45° angle, 5px distance, 2px blur
     * scene.dropShadow(128, 128, 128, 200, 45, 5, 2, 60);
     * ```
     */
    dropShadow(r: number, g: number, b: number, a: number, angle: number, distance: number, sigma: number, quality?: number): this;
    /**
     * Override the scene content color with a given fill color.
     *
     * @param r - Red component (0-255)
     * @param g - Green component (0-255)
     * @param b - Blue component (0-255)
     * @param a - Alpha/opacity (0-255)
     * @returns The Scene instance for method chaining
     *
     * @example
     * ```typescript
     * const scene = new TVG.Scene();
     * scene.add(shape1);
     * scene.add(shape2);
     * scene.fillEffect(255, 0, 0, 128); // Fill entire scene with semi-transparent red
     * ```
     */
    fillEffect(r: number, g: number, b: number, a: number): this;
    /**
     * Apply a tint effect to the scene using black and white color parameters.
     *
     * @param blackR - Black tint red component (0-255)
     * @param blackG - Black tint green component (0-255)
     * @param blackB - Black tint blue component (0-255)
     * @param whiteR - White tint red component (0-255)
     * @param whiteG - White tint green component (0-255)
     * @param whiteB - White tint blue component (0-255)
     * @param intensity - Tint intensity (0-100)
     * @returns The Scene instance for method chaining
     *
     * @example
     * ```typescript
     * const scene = new TVG.Scene();
     * scene.add(picture);
     * // Apply sepia-like tint
     * scene.tint(112, 66, 20, 255, 236, 184, 50);
     * ```
     */
    tint(blackR: number, blackG: number, blackB: number, whiteR: number, whiteG: number, whiteB: number, intensity: number): this;
    /**
     * Apply a tritone color effect to the scene using three color parameters for shadows, midtones, and highlights.
     * A blending factor determines the mix between the original color and the tritone colors.
     *
     * @param shadowR - Shadow red component (0-255)
     * @param shadowG - Shadow green component (0-255)
     * @param shadowB - Shadow blue component (0-255)
     * @param midtoneR - Midtone red component (0-255)
     * @param midtoneG - Midtone green component (0-255)
     * @param midtoneB - Midtone blue component (0-255)
     * @param highlightR - Highlight red component (0-255)
     * @param highlightG - Highlight green component (0-255)
     * @param highlightB - Highlight blue component (0-255)
     * @param blend - Blend factor (0-255)
     * @returns The Scene instance for method chaining
     *
     * @example
     * ```typescript
     * const scene = new TVG.Scene();
     * scene.add(picture);
     * // Apply tritone: dark blue shadows, gray midtones, yellow highlights
     * scene.tritone(0, 0, 128, 128, 128, 128, 255, 255, 0, 128);
     * ```
     */
    tritone(shadowR: number, shadowG: number, shadowB: number, midtoneR: number, midtoneG: number, midtoneB: number, highlightR: number, highlightG: number, highlightB: number, blend: number): this;
}

/**
 * Render text with fonts and styling
 * @category Text
 */

/**
 * @category Text
 */
interface TextLayout {
    width: number;
    height?: number;
}
/**
 * @category Text
 */
interface TextOutline {
    width: number;
    color: readonly [number, number, number];
}
/**
 * Describes the font metrics of a text object.
 *
 * Provides the basic vertical layout metrics used for text rendering,
 * such as ascent, descent, and line spacing (linegap).
 *
 * @see {@link Text.metrics}
 * @category Text
 *
 * @beta
 */
interface TextMetrics {
    /** Distance from the baseline to the top of the highest glyph (usually positive). */
    ascent: number;
    /** Distance from the baseline to the bottom of the lowest glyph (usually negative, as in TTF). */
    descent: number;
    /** Additional spacing recommended between lines (leading). */
    linegap: number;
    /** The total vertical advance between lines of text: ascent - descent + linegap (i.e., ascent + |descent| + linegap when descent is negative). */
    advance: number;
}
/**
 * Describes the layout metrics of a glyph.
 *
 * Provides the basic layout metrics used for positioning an individual glyph,
 * including its advance along the baseline direction, bearing relative to the
 * inline axis origin, and its bounding box in local glyph space.
 *
 * The advance value represents the distance the pen position moves along the
 * baseline (inline direction), regardless of whether the text is laid out
 * horizontally or vertically.
 *
 * The bounding box is defined in the glyph's local coordinate space and is
 * independent of any layout direction or transformation.
 *
 * @see {@link Text.metrics}
 * @category Text
 *
 * @beta
 */
interface GlyphMetrics {
    /** The advance distance along the baseline (inline) direction. */
    advance: number;
    /** The bearing from the origin to the glyph's visible bound along the inline-start direction. */
    bearing: number;
    /** The minimum point of the glyph bounding box in local space. */
    min: {
        x: number;
        y: number;
    };
    /** The maximum point of the glyph bounding box in local space. */
    max: {
        x: number;
        y: number;
    };
}
/**
 * Text rendering class with font support
 * @category Text
 *
 * @example
 * ```typescript
 * // Basic text rendering
 * const text = new TVG.Text();
 * text.font('Arial', 48)
 *     .text('Hello ThorVG!')
 *     .fill(50, 50, 50, 255)
 *     .translate(100, 200);
 *
 * canvas.add(text);
 * ```
 *
 * @example
 * ```typescript
 * // Text with custom font and styling
 * // Load custom font first
 * const fontData = await fetch('/fonts/custom.ttf').then(r => r.arrayBuffer());
 * TVG.Font.load('CustomFont', new Uint8Array(fontData));
 *
 * const text = new TVG.Text();
 * text.font('CustomFont', 64)
 *     .text('Custom Font')
 *     .fill(100, 150, 255, 255)
 *     .stroke(50, 50, 50, 255, 2);
 *
 * canvas.add(text);
 * ```
 *
 * @example
 * ```typescript
 * // Multi-line text with wrapping
 * const text = new TVG.Text();
 * text.font('Arial')
 *     .fontSize(24)
 *     .text('This is a long text that will wrap across multiple lines')
 *     .fill(50, 50, 50)
 *     .layout(300, 200)
 *     .wrap(TextWrapMode.Word);
 *
 * canvas.add(text);
 * ```
 */
declare class Text extends Paint {
    constructor();
    protected _createInstance(ptr: number): Text;
    /**
     * Set the font to use for this text.
     * @param name - Font name
      */
    font(name: string): this;
    /**
     * Set the text content (UTF-8 supported)
     * @param content - Text content to display
     */
    text(content: string): this;
    /**
     * Set the font size
     * @param size - Font size in pixels
     */
    fontSize(size: number): this;
    /**
     * Set text color (RGB) or fill with gradient
     */
    fill(gradient: Fill): this;
    fill(r: number, g: number, b: number): this;
    /**
     * Set text alignment/anchor point
     * @param x - Horizontal alignment/anchor in [0..1]: 0=left/start, 0.5=center, 1=right/end (Default: 0)
     * @param y - Vertical alignment/anchor in [0..1]: 0=top, 0.5=middle, 1=bottom (Default: 0)
     */
    align(x: number, y: number): this;
    /**
     * Set text layout constraints (for wrapping)
     * @param width - Maximum width (0 = no constraint)
     * @param height - Maximum height (0 = no constraint)
     */
    layout(width: number, height?: number): this;
    /**
     * Set text wrap mode
     * @param mode - Wrap mode: TextWrapMode.None, TextWrapMode.Character, TextWrapMode.Word, TextWrapMode.Smart, or TextWrapMode.Ellipsis
     */
    wrap(mode: TextWrapMode): this;
    /**
     * Get the number of text lines.
     *
     * Reflects the layout produced by the current wrap configuration, and also counts
     * explicit line feed characters ('\n') contained in the text.
     *
     * @returns The total number of lines
     *
     * @see {@link wrap}
     *
     * @example
     * ```typescript
     * text.text('Hello wrapped world').layout(100).wrap(TVG.TextWrapMode.Word);
     * console.log(text.lines()); // number of lines after wrapping
     * ```
     */
    lines(): number;
    /**
     * Retrieves the layout metrics of the text object.
     *
     * Returns the font layout values of this text object,
     * such as ascent, descent, linegap, and line advance.
     *
     * The returned values reflect the font size applied to the text object,
     * but do not include any transformations (e.g., scale, rotation, or translation).
     *
     * @returns The font metrics of this text object
     *
     * @example
     * ```typescript
     * text.font('poppins').fontSize(16);
     * const { ascent, descent, advance } = text.metrics();
     * ```
     *
     * @see {@link TextMetrics}
     *
     * @beta
     */
    metrics(): TextMetrics;
    /**
     * Retrieves the layout metrics of a glyph in the text object.
     *
     * Returns the horizontal layout values of the specified glyph,
     * such as advance, left-side bearing, and bounding box.
     *
     * The returned values reflect the font size applied to the text object,
     * but do not include any transformations (e.g., scale, rotation, or translation).
     *
     * The input must be a single character.
     *
     * @param char - A single character
     * @returns The layout metrics of the glyph
     *
     * @example
     * ```typescript
     * // Measure the width of a string
     * let width = 0;
     * for (const char of 'Hello') {
     *   width += text.metrics(char).advance;
     * }
     * ```
     *
     * @see {@link GlyphMetrics}
     * @remarks Currently, ThorVG only supports horizontal text layout.
     *
     * @beta
     */
    metrics(char: string): GlyphMetrics;
    /**
     * Set text spacing (letter and line spacing)
     * @param letter - Letter spacing scale factor (1.0 = default, >1.0 = wider, <1.0 = narrower)
     * @param line - Line spacing scale factor (1.0 = default, >1.0 = wider, <1.0 = narrower)
     */
    spacing(letter: number, line: number): this;
    /**
     * Set italic style with shear factor
     * @param shear - Shear factor (0.0 = no italic, default: 0.18, typical range: 0.1-0.3)
     */
    italic(shear?: number): this;
    /**
     * Set text outline (stroke)
     * @param width - Outline width
     * @param r - Red (0-255)
     * @param g - Green (0-255)
     * @param b - Blue (0-255)
     */
    outline(width: number, r: number, g: number, b: number): this;
}

/**
 * Linear gradient fill
 * @category Gradients
 */

/**
 * Linear gradient for filling shapes
 * @category Gradients
 *
 * @example
 * ```typescript
 * // Basic linear gradient
 * const gradient = new TVG.LinearGradient(100, 100, 300, 100);
 * gradient.addStop(0, [255, 0, 0, 255])    // Red
 *         .addStop(0.5, [255, 255, 0, 255]) // Yellow
 *         .addStop(1, [0, 255, 0, 255]);    // Green
 *
 * const shape = new TVG.Shape();
 * shape.appendRect(100, 100, 200, 100)
 *      .fillGradient(gradient);
 *
 * canvas.add(shape);
 * ```
 *
 * @example
 * ```typescript
 * // Vertical gradient with transparency
 * const gradient = new TVG.LinearGradient(200, 100, 200, 300);
 * gradient.addStop(0, [100, 150, 255, 255])
 *         .addStop(1, [100, 150, 255, 0])
 *         .spread(GradientSpread.Pad);
 *
 * const shape = new TVG.Shape();
 * shape.appendRect(150, 100, 100, 200)
 *      .fillGradient(gradient);
 *
 * canvas.add(shape);
 * ```
 */
declare class LinearGradient extends Fill {
    constructor(x1: number, y1: number, x2: number, y2: number);
    /**
     * Build the gradient (apply all color stops)
     * This should be called after all addStop() calls
     */
    build(): this;
}

/**
 * Radial gradient fill
 * @category Gradients
 */

/**
 * Radial gradient for filling shapes
 * @category Gradients
 *
 * @example
 * ```typescript
 * // Basic radial gradient
 * const gradient = new TVG.RadialGradient(200, 200, 100);
 * gradient.addStop(0, [255, 255, 255, 255])  // White center
 *         .addStop(1, [100, 100, 255, 255]);  // Blue edge
 *
 * const shape = new TVG.Shape();
 * shape.appendCircle(200, 200, 100)
 *      .fillGradient(gradient);
 *
 * canvas.add(shape);
 * ```
 *
 * @example
 * ```typescript
 * // Radial gradient with focal point
 * // Create gradient with offset focal point for lighting effect
 * const gradient = new TVG.RadialGradient(
 *   200, 200, 100,  // Center and radius
 *   170, 170, 0     // Focal point (offset)
 * );
 * gradient.addStop(0, [255, 255, 200, 255])
 *         .addStop(1, [255, 100, 100, 255]);
 *
 * const shape = new TVG.Shape();
 * shape.appendCircle(200, 200, 100)
 *      .fillGradient(gradient);
 *
 * canvas.add(shape);
 * ```
 */
declare class RadialGradient extends Fill {
    constructor(cx: number, cy: number, r: number, fx?: number, fy?: number, fr?: number);
    /**
     * Build the gradient (apply all color stops)
     * This should be called after all addStop() calls
     */
    build(): this;
}

/**
 * Conic gradient fill
 * @category Gradients
 */

/**
 * Conic gradient for filling shapes
 *
 * The gradient color transitions by the angle measured around a center point,
 * completing a full clockwise turn from the start angle.
 *
 * Spread options are ignored because the gradient always sweeps a full turn.
 * @category Gradients
 *
 * @example
 * ```typescript
 * // Color wheel
 * const gradient = new TVG.ConicGradient(200, 200);
 * gradient.addStop(0, [255, 0, 0, 255])       // Red
 *         .addStop(1 / 3, [0, 255, 0, 255])   // Green
 *         .addStop(2 / 3, [0, 0, 255, 255])   // Blue
 *         .addStop(1, [255, 0, 0, 255]);      // Back to red for a seamless loop
 *
 * const shape = new TVG.Shape();
 * shape.appendCircle(200, 200, 100)
 *      .fill(gradient);
 *
 * canvas.add(shape);
 * ```
 *
 * @example
 * ```typescript
 * // Sweep starting from 12 o'clock
 * const gradient = new TVG.ConicGradient(200, 200, -90);
 * gradient.addStop(0, [255, 255, 255, 0])
 *         .addStop(1, [0, 150, 255, 255]);
 *
 * const shape = new TVG.Shape();
 * shape.appendCircle(200, 200, 100)
 *      .fill(gradient);
 *
 * canvas.add(shape);
 * ```
 *
 * @beta
 */
declare class ConicGradient extends Fill {
    /**
     * The gradient sweeps a full turn clockwise around the center (cx, cy), beginning at angle.
     * Color stop offsets from 0 to 1 map clockwise over one full turn from angle.
     *
     * @param cx - The horizontal coordinate of the center of the gradient
     * @param cy - The vertical coordinate of the center of the gradient
     * @param angle - The initial angle in degrees, measured clockwise from the 3 o'clock direction (positive x-axis). Default: 0
     */
    constructor(cx: number, cy: number, angle?: number);
    /**
     * Build the gradient (apply all color stops)
     * This should be called after all addStop() calls
     */
    build(): this;
}

/**
 * Font provider abstraction for pluggable font sources.
 * @category Font
 */

/**
 * Result returned by a {@link FontProvider} after fetching font data.
 * @category Font
 */
interface FontProviderResult {
    /** Raw font binary data */
    data: Uint8Array;
    /** Font format */
    type: FontType;
}
/**
 * Interface for pluggable font sources.
 *
 * A font provider resolves a font name into binary font data.
 * Implement this interface to load fonts from any source — a self-hosted
 * CDN, a local server, or any custom storage.
 *
 * @category Font
 *
 * @example
 * ```typescript
 * TVG.Font.provider({
 *   fetch: async (name) => {
 *     const res = await fetch(`/my-fonts/${name}.ttf`);
 *     return { data: new Uint8Array(await res.arrayBuffer()), type: 'ttf' };
 *   }
 * });
 *
 * await TVG.Font.load('my-font');
 * ```
 */
interface FontProvider {
    /**
     * Fetch font data by name.
     * @param name - Font name as provided by the caller
     * @param options - Provider-specific options
     * @returns Font binary data and format
     */
    fetch(name: string, options?: Record<string, unknown>): Promise<FontProviderResult>;
}

/**
 * Load and manage fonts
 * @category Font
 */

/**
 * Supported font file types.
 * - `'ttf'`: TrueType Font
 * - `'otf'`: OpenType Font
 * @category Font
 */
type FontType = 'ttf' | 'otf';
/**
 * @category Font
 */
interface LoadFontOptions {
    /** Font type ('ttf' | 'otf') */
    type?: FontType;
}
/**
 * Font loader class for managing custom fonts.
 * Fonts are loaded globally and can be referenced by name in {@link Text} objects.
 * @category Font
 *
 * @example
 * ```typescript
 * // Load font from raw data
 * const fontData = await fetch('/fonts/Roboto-Regular.ttf').then(r => r.arrayBuffer());
 * TVG.Font.load('Roboto', new Uint8Array(fontData));
 *
 * const text = new TVG.Text();
 * text.font('Roboto').fontSize(48).text('Hello!').fill(50, 50, 50);
 * ```
 *
 * @example
 * ```typescript
 * // Auto-load from the configured font provider (fontsource CDN by default)
 * await TVG.Font.load('poppins');
 * await TVG.Font.load('roboto', { weight: 700, style: 'italic' });
 *
 * const text = new TVG.Text();
 * text.font('poppins').fontSize(48).text('Hello!').fill(50, 50, 50);
 * ```
 *
 * @example
 * ```typescript
 * // Use a custom font provider
 * TVG.Font.provider({
 *   fetch: async (name) => {
 *     const res = await fetch(`/my-fonts/${name}.ttf`);
 *     return { data: new Uint8Array(await res.arrayBuffer()), type: 'ttf' };
 *   }
 * });
 *
 * await TVG.Font.load('my-font');
 * ```
 */
declare class Font {
    #private;
    /**
     * Set the font provider used when calling `Font.load()` without raw data.
     *
     * The default provider fetches from the [fontsource](https://fontsource.org) CDN.
     * Replace it to load fonts from your own CDN or any other source.
     *
     * @param provider - A {@link FontProvider} implementation
     *
     * @example
     * ```typescript
     * TVG.Font.provider({
     *   fetch: async (name) => {
     *     const res = await fetch(`https://my-cdn.com/fonts/${name}.ttf`);
     *     return { data: new Uint8Array(await res.arrayBuffer()), type: 'ttf' };
     *   }
     * });
     * ```
     */
    static provider(provider: FontProvider): void;
    /**
     * Load font from raw data.
     * @param name - Unique name to identify this font
     * @param data - Raw font binary data
     * @param options - Load options
     */
    static load(name: string, data: Uint8Array, options?: LoadFontOptions): void;
    /**
     * Auto-load a font using the configured font provider.
     *
     * With the default {@link FontsourceProvider}, the name must match a fontsource
     * package slug (e.g. `'poppins'`, `'open-sans'`).
     *
     * @param name - Font name passed to the provider
     * @param options - Provider-specific options (see {@link FontsourceOptions} for defaults)
     *
     * @example
     * ```typescript
     * await TVG.Font.load('poppins');
     * await TVG.Font.load('roboto', { weight: 700 });
     * await TVG.Font.load('noto-sans', { subset: 'latin-ext' });
     * ```
     */
    static load(name: string, options?: Record<string, unknown>): Promise<void>;
    /**
     * Unload a previously loaded font.
     * @param name - Font name to unload
     */
    static unload(name: string): void;
}

/**
 * Utility class for traversing and inspecting paint trees
 * @category Accessor
 */
declare class Accessor extends WasmObject {
    constructor();
    protected _cleanup(ptr: number): void;
    /**
     * Generate a unique hash ID from a string name (DJB2 hash).
     *
     * @param name - The string name to hash
     * @returns The generated hash ID
     */
    static id(name: string): number;
    /**
     * Traverse the scene tree of a paint and invoke a callback on the paint and each of its
     * descendants. The callback receives the correctly typed Paint subclass (Shape, Scene,
     * Picture, or Text). Return false from the callback to stop traversal early.
     *
     * @param paint - The root paint node to traverse, typically a Picture or Scene
     * @param callback - Called for the root and each descendant paint. Return false to stop.
     *
     * @remarks
     * A bitmap-based Picture might not have a scene tree.
     *
     * @example
     * ```typescript
     * const accessor = new TVG.Accessor();
     *
     * accessor.set(picture, (paint) => {
     *   if (paint instanceof TVG.Shape) {
     *     paint.fill(0, 0, 255);
     *   }
     *   return true; // continue traversal
     * });
     * ```
     */
    set(paint: Paint, callback: (paint: Paint) => boolean): void;
    /**
     * Retrieve the original name string for a given ID.
     *
     * @param id - The unique identifier, e.g. from {@link Paint.id}
     * @returns The corresponding name, or null if not found or unavailable
     *
     * @remarks
     * Only resolves while {@link set} is traversing, and only when the picture was marked
     * accessible *before* loading (see {@link Picture.accessible}). Returns null otherwise.
     *
     * @example
     * ```typescript
     * const picture = new TVG.Picture();
     * picture.accessible = true;
     * picture.load(svgData, { type: 'svg' });
     *
     * const accessor = new TVG.Accessor();
     * accessor.set(picture, (paint) => {
     *   if (accessor.name(paint.id) === 'background') paint.fill(255, 0, 0);
     *   return true;
     * });
     * ```
     */
    name(id: number): string | null;
}

/**
 * Fontsource CDN font provider.
 * @category Font
 */

/**
 * Options for loading a font from the fontsource CDN.
 * @category Font
 */
interface FontsourceOptions {
    /**
     * Font weight to load.
     * @defaultValue 400
     */
    weight?: 100 | 200 | 300 | 400 | 500 | 600 | 700 | 800 | 900;
    /**
     * Font style to load.
     * @defaultValue 'normal'
     */
    style?: 'normal' | 'italic';
    /**
     * Unicode subset to load.
     * @defaultValue 'latin'
     */
    subset?: string;
}
/**
 * Font provider that fetches fonts from the [fontsource](https://fontsource.org) CDN.
 *
 * This is the default provider used by {@link Font.load} when no raw data is supplied.
 *
 * @category Font
 *
 * @example
 * ```typescript
 * // Restore to default (if you previously swapped it out)
 * TVG.Font.provider(new FontsourceProvider());
 * ```
 */
declare class FontsourceProvider implements FontProvider {
    fetch(name: string, options?: FontsourceOptions): Promise<FontProviderResult>;
}

/**
 * ThorVG error result codes returned by native WASM operations.
 *
 * @category Error Handling
 */
declare enum ThorVGResultCode {
    Success = 0,
    InvalidArguments = 1,
    InsufficientCondition = 2,
    FailedAllocation = 3,
    MemoryCorruption = 4,
    NotSupported = 5,
    SystemError = 6,
    Unknown = 255
}
/**
 * Error class for ThorVG WASM operations.
 * Contains error code and operation information.
 *
 * @category Error Handling
 */
declare class ThorVGError extends Error {
    readonly code: ThorVGResultCode;
    readonly operation: string;
    constructor(message: string, code: ThorVGResultCode, operation: string);
    static fromCode(code: ThorVGResultCode, operation: string): ThorVGError;
}
/**
 * Context information provided when an error occurs.
 *
 * @category Error Handling
 */
interface ErrorContext {
    /** The operation that failed (e.g., 'moveTo', 'render', 'update') */
    operation: string;
}
/**
 * Error handler callback function.
 *
 * Handles both ThorVG WASM errors (ThorVGError) and JavaScript errors (Error).
 * Use instanceof to distinguish between error types.
 *
 * @category Error Handling
 *
 * @example
 * ```typescript
 * import { init } from '@thorvg/webcanvas';
 *
 * const TVG = await init({
 *   onError: (error, context) => {
 *     if (error instanceof ThorVGError) {
 *       // WASM error - has error.code
 *       console.log('WASM error code:', error.code);
 *     } else {
 *       // JavaScript error
 *       console.log('JS error:', error.message);
 *     }
 *   }
 * });
 * ```
 */
interface ErrorHandler {
    (error: Error, context: ErrorContext): void;
}

/**
 * ThorVG WebCanvas - TypeScript API for ThorVG
 *
 * @packageDocumentation
 *
 * A high-performance TypeScript Canvas API for ThorVG, with fluent and
 * object-oriented vector graphics rendering via WebAssembly.
 *
 * ## Features
 *
 * - **Intuitive OOP API** - Fluent interface with method chaining
 * - **Type-Safe** - Full TypeScript support with strict typing
 * - **High Performance** - WebGPU, WebGL, and Software rendering backends
 * - **Automatic Memory Management** - FinalizationRegistry for garbage collection
 * - **Method Chaining** - Ergonomic fluent API design
 * - **Zero Overhead** - Direct WASM bindings with minimal abstraction
 * - **Animation Support** - Frame-based Lottie animation playback
 * - **Rich Primitives** - Shapes, scenes, pictures, text, and gradients
 *
 * @example
 * ```typescript
 * import ThorVG from '@thorvg/webcanvas';
 *
 * // Initialize ThorVG with renderer
 * const TVG = await ThorVG.init({
 *   locateFile: (path) => `/wasm/${path}`,
 *   renderer: 'gl'
 * });
 *
 * // Create canvas and draw
 * const canvas = new TVG.Canvas('#canvas', { width: 800, height: 600 });
 * const shape = new TVG.Shape();
 * shape.appendRect(100, 100, 200, 150)
 *      .fill(255, 0, 0, 255);
 * canvas.add(shape).render();
 * ```
 *
 * @module
 */

/**
 * @category Initialization
 */
interface InitOptions {
    /** Optional function to locate WASM files. If not provided, assumes WASM files are in the same directory as the JavaScript bundle. */
    locateFile?: (path: string) => string;
    /** Renderer type: 'sw' (Software), 'gl' (WebGL), or 'wg' (WebGPU). Default: 'gl'. WebGPU provides best performance but requires Chrome 113+ or Edge 113+. */
    renderer?: RendererType;
    /** Global error handler for all ThorVG operations. If provided, errors will be passed to this handler instead of being thrown. */
    onError?: ErrorHandler;
    /** Number of worker threads count. Ignored in default preset. Default: 0. */
    threads?: number;
}
interface ThorVGNamespace {
    Paint: typeof Paint;
    Canvas: typeof Canvas;
    Shape: typeof Shape;
    Scene: typeof Scene;
    Picture: typeof Picture;
    Text: typeof Text;
    Animation: typeof Animation;
    LottieAnimation: typeof LottieAnimation;
    Video: typeof Video;
    LinearGradient: typeof LinearGradient;
    RadialGradient: typeof RadialGradient;
    ConicGradient: typeof ConicGradient;
    Font: typeof Font;
    Accessor: typeof Accessor;
    BlendMethod: typeof BlendMethod;
    StrokeCap: typeof StrokeCap;
    StrokeJoin: typeof StrokeJoin;
    FillRule: typeof FillRule;
    PathCommand: typeof PathCommand;
    GradientSpread: typeof GradientSpread;
    MaskMethod: typeof MaskMethod;
    SceneEffect: typeof SceneEffect;
    TextWrapMode: typeof TextWrapMode;
    ColorSpace: typeof ColorSpace;
    FilterMethod: typeof FilterMethod;
    EngineOption: typeof EngineOption;
    /** ThorVG engine version string */
    version: string;
    term(): void;
}
/**
 * Initialize ThorVG WASM module and rendering engine.
 *
 * This is the entry point for using ThorVG WebCanvas. It loads the WebAssembly module
 * and initializes the rendering engine with the specified backend (Software, WebGL, or WebGPU).
 *
 * @category Initialization
 * @param options - Initialization options
 * @param options.locateFile - Optional function to locate WASM files. If not provided, assumes
 *                              WASM files are in the same directory as the JavaScript bundle.
 * @param options.renderer - Renderer type: 'sw' (Software), 'gl' (WebGL), or 'wg' (WebGPU).
 *                           Default: 'gl'. WebGPU provides best performance but requires
 *                           Chrome 113+ or Edge 113+.
 * @param options.threads - Number of worker threads. Only effective with the thread preset.
 *                          Ignored in the default preset. Default: 0 (single-threaded).
 *
 * @returns Promise that resolves to ThorVG namespace containing all classes and utilities
 *
 * @example
 * ```typescript
 * // Initialize with default WebGL renderer
 * const TVG = await ThorVG.init();
 * const canvas = new TVG.Canvas('#canvas');
 * ```
 *
 * @example
 * ```typescript
 * // Initialize with custom WASM file location
 * const TVG = await ThorVG.init({
 *   locateFile: (path) => `/public/wasm/${path}`,
 *   renderer: 'gl'
 * });
 * ```
 *
 * @example
 * ```typescript
 * // Initialize with WebGPU for maximum performance
 * const TVG = await ThorVG.init({
 *   locateFile: (path) => '../dist/' + path.split('/').pop(),
 *   renderer: 'wg'
 * });
 * ```
 *
 * @example
 * ```typescript
 * // Initialize with Software renderer for maximum compatibility
 * const TVG = await ThorVG.init({
 *   renderer: 'sw'
 * });
 * ```
 *
 * @example
 * ```typescript
 * // Initialize with thread-enabled preset
 * import ThorVG from '@thorvg/webcanvas/thread';
 *
 * const TVG = await ThorVG.init({
 *   locateFile: (path) => `/wasm/thread/${path}`,
 *   threads: 4
 * });
 * ```
 *
 * @throws {Error} If WASM module fails to load or engine initialization fails
 */
declare function init(options?: InitOptions): Promise<ThorVGNamespace>;
declare const ThorVG: {
    init: typeof init;
};

export { Accessor, Animation, Canvas, ConicGradient, Font, FontsourceProvider, LinearGradient, LottieAnimation, Paint, Picture, RadialGradient, Scene, Shape, Text, ThorVGError, ThorVGResultCode, Video, constants, ThorVG as default, init };
export type { AnimationInfo, AnimationSegment, AssetResolver, AudioInfo, AudioResolver, Bounds, CanvasOptions, CanvasTarget, ColorStop, ErrorContext, ErrorHandler, FontProvider, FontProviderResult, FontType, FontsourceOptions, GlyphMetrics, InitOptions, LoadDataOptions, LoadFontOptions, LottieMarker, LottieSlotData, Matrix, MimeType, PictureSize, RectOptions, RendererType, StrokeOptions, TextLayout, TextMetrics, TextOutline, ThorVGNamespace };
