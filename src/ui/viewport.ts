import type { Viewport } from '../core/types';

const DEFAULT_VIEW: Viewport = { xMin: -5, xMax: 5, yMin: -5, yMax: 5 };
const MIN_SPAN = 1e-3;
const MAX_SPAN = 1e6;

export class ViewportTransform {
  private view: Viewport;
  private home: Viewport;
  private imageSize: {width:number;height:number;padding:number}|null = null;
  width: number;
  height: number;

  constructor(view: Viewport = DEFAULT_VIEW, width: number, height: number) {
    this.checkSize(width, height);
    this.checkView(view);
    this.view = { ...view };
    this.home = { ...view };
    this.width = width;
    this.height = height;
  }

  get current(): Viewport { return { ...this.view }; }

  resize(width: number, height: number): void {
    this.checkSize(width, height);
    if(this.imageSize && (width !== this.width || height !== this.height)){
      const atHome=Object.keys(this.view).every(key=>
        this.view[key as keyof Viewport]===this.home[key as keyof Viewport]);
      const centerX=(this.view.xMin+this.view.xMax)/2;
      const centerY=(this.view.yMin+this.view.yMax)/2;
      const unit=(this.view.xMax-this.view.xMin)/this.width;
      const xSpan=unit*width,ySpan=unit*height;
      this.home=this.imageBounds(this.imageSize.width,this.imageSize.height,
        this.imageSize.padding,width,height);
      this.view=atHome?{...this.home}:{xMin:centerX-xSpan/2,xMax:centerX+xSpan/2,
        yMin:centerY-ySpan/2,yMax:centerY+ySpan/2};
    }
    this.width = width;
    this.height = height;
  }

  /** Image coordinates count original pixels, with (0, 0) at the bottom left. */
  fitImage(width:number,height:number,padding=.08):void {
    this.checkSize(width,height);
    if(!Number.isFinite(padding)||padding<0||padding>=1)throw new RangeError('Invalid image padding');
    const fitted=this.imageBounds(width,height,padding,this.width,this.height);
    this.checkView(fitted);
    this.imageSize={width,height,padding};
    this.home=fitted;this.view={...fitted};
  }

  private imageBounds(imageWidth:number,imageHeight:number,padding:number,
    screenWidth:number,screenHeight:number):Viewport {
    const ratio=screenWidth/screenHeight;
    const xSpan=Math.max(imageWidth,imageHeight*ratio)*(1+2*padding);
    const ySpan=xSpan/ratio;
    return {xMin:(imageWidth-xSpan)/2,xMax:(imageWidth+xSpan)/2,
      yMin:(imageHeight-ySpan)/2,yMax:(imageHeight+ySpan)/2};
  }

  screenToWorld(px: number, py: number): { x: number; y: number } {
    return {
      x: this.view.xMin + px / this.width * (this.view.xMax - this.view.xMin),
      y: this.view.yMax - py / this.height * (this.view.yMax - this.view.yMin),
    };
  }

  worldToScreen(x: number, y: number): { x: number; y: number } {
    return {
      x: (x - this.view.xMin) / (this.view.xMax - this.view.xMin) * this.width,
      y: (this.view.yMax - y) / (this.view.yMax - this.view.yMin) * this.height,
    };
  }

  zoomAt(px: number, py: number, factor: number): void {
    if (!Number.isFinite(factor) || factor <= 0) return;
    const anchor = this.screenToWorld(px, py);
    let xSpan = Math.min(MAX_SPAN, Math.max(MIN_SPAN, (this.view.xMax - this.view.xMin) / factor));
    let ySpan = Math.min(MAX_SPAN, Math.max(MIN_SPAN, (this.view.yMax - this.view.yMin) / factor));
    if(this.imageSize){
      // Keep one source pixel square even after the zoom limit is reached.
      const ratio=this.width/this.height;
      xSpan=Math.min(Math.min(MAX_SPAN,MAX_SPAN*ratio),
        Math.max(Math.max(MIN_SPAN,MIN_SPAN*ratio),
          (this.view.xMax-this.view.xMin)/factor));
      ySpan=xSpan/ratio;
    }
    const xMin = anchor.x - px / this.width * xSpan;
    const yMax = anchor.y + py / this.height * ySpan;
    this.view = { xMin, xMax: xMin + xSpan, yMin: yMax - ySpan, yMax };
  }

  pan(dxPx: number, dyPx: number): void {
    if (!Number.isFinite(dxPx) || !Number.isFinite(dyPx)) return;
    const dx = dxPx / this.width * (this.view.xMax - this.view.xMin);
    const dy = dyPx / this.height * (this.view.yMax - this.view.yMin);
    this.view = {
      xMin: this.view.xMin - dx,
      xMax: this.view.xMax - dx,
      yMin: this.view.yMin + dy,
      yMax: this.view.yMax + dy,
    };
  }

  reset(): void { this.view = { ...this.home }; }

  private checkSize(width: number, height: number): void {
    if (!(width > 0) || !(height > 0) || !Number.isFinite(width) || !Number.isFinite(height)) {
      throw new RangeError('Canvas size must be finite and positive');
    }
  }

  private checkView(view: Viewport): void {
    if (!Object.values(view).every(Number.isFinite) || view.xMin >= view.xMax || view.yMin >= view.yMax) {
      throw new RangeError('Viewport bounds must be finite and increasing');
    }
  }
}
