// conversion from 8bit indexed image (zx palette 8 colors)
// to PP01 videoram format
// 3 bitplanes, 24kb of raw data, R, G, B. Each 32x256 = 8192 byes
// 18.03.2021

var im0	=	getImageID();	// source image
var maxX	=	getWidth();
var maxY	=	getHeight();
var iName	=	getTitle();
newImage(iName+"_pp", "8-bit White", 32, 256*3, 1);
var im1 	= 	getImageID();	// destination image;

setBatchMode(true);

for(y=0; y<maxY; y++) {
	for(x=0; x<maxX; x+=8) {
		b1 = 0;
		b2 = 0;
		b3 = 0;

		for(i=0; i<8; i++) {
			selectImage(im0);
			col = getPixel(x+i, y);
			b1  = b1<<1 | (col&1);			//blue
			b2  = b2<<1 | ((col&2) >> 1);	//red
			b3  = b3<<1 | ((col&4) >> 2);	//green
		}
	selectImage(im1);
	setPixel(x/8,y    ,b2);
	setPixel(x/8,y+256,b3);
	setPixel(x/8,y+512,b1);
	}
}
setBatchMode(false);
