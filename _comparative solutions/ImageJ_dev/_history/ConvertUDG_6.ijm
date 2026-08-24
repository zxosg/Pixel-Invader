var srcID = getImageID();
var srcName = getTitle();

// source image size
var w = getWidth();
var h = getHeight();

run("Select None");
run("Duplicate...", " ");
var dstID = getImageID();
var dstName = getTitle();

// char width / height
var chw = 8;
var chh = 8;

var chFile = "Q:/Development/Dev-ZX/Graphics/convert/";

Dialog.create("Select font file");
Dialog.addFile("Path", chFile)
Dialog.show();

chFile = Dialog.getString();

var chLen  = File.length(chFile);
var chNum  = chLen/chh;
var chMatrix = newArray(chNum*chw/2*chh/2*16);
var chWeight = newArray(chNum*16);
var chRank   = newArray(chNum*16);
var chID;

setBatchMode(true);
loadCharset();

var px = newArray(chw/2*chh/2);
selectImage(srcID);

for(y=0; y<h; y+=chh) {
	for(x=0; x<w; x+=chw) {
		makeRectangle(x,y,chw,chh);
		getStatistics(area,mean,pap,ink,std, attrCount);
		k=0;
		for(j=0; j<chh; j+=2) {
			for(i=0; i<chw; i+=2) {
				p=getPixel(x+i,y+j)+getPixel(x+i+1,y+j)+getPixel(x+i,y+j+1)+getPixel(x+i+1,y+j+1);
				px[k]=floor(p/ink);
				k++;
			}
		}
	matchChar();
	drawChar(x,y);
	}
}
selectImage(chID);
close()
setBatchMode(false);

function matchChar() {
	mpsize = chw/2*chh/2;
	iw = 0;
	for(b=0; b<chMatrix.length; b+=mpsize) {
		diff=0;
		dif2=0;
		for(a=0; a<px.length; a++) {
			diff=diff+abs(px[a]-chMatrix[a+b]);
		}
		chWeight[iw] = diff;
		iw++;
	}
	chRank = Array.rankPositions(chWeight);
}

function drawChar(x,y) {
	selectImage(chID);
	char=chRank[0];

	makeRectangle(0,char*chh,chw,chh);
	Image.copy;
	selectImage(dstID);
	Image.paste(x,y);
	makeRectangle(x,y,chw,chh);
	changeValues(0,0,pap);
	changeValues(255,255,ink);
	selectImage(srcID);
}

function loadCharset() {
	run("Raw...", "open=[" + chFile + "] image=[1-bit Bitmap] width=" + chw + " height=" +chLen);
	chID = getImageID();

// *** inverted
	run("Select All");
	run("Copy");
	cw = getWidth();
	ch = getHeight();
	run("Canvas Size...", "width="+cw+" height="+ch*2+" position=Top-Left zero");
	makeRectangle(0, ch, cw, ch);
	run("Paste");
	run("Invert");

	run("Select All");
	run("Copy");
	wh = getHeight();
	run("Canvas Size...", "width="+cw+" height="+ch*16+" position=Top-Left zero");

	for(i=1; i<8; i++) {
		makeRectangle(0,i*wh,cw,wh);
		run("Paste");
		for(j=0; j<wh/chh; j++) {
			makeRectangle(0,i*wh+j*chh,chw,chh);
			if(i&1 == 1)
				run("Flip Horizontally");
			if(i&2 == 2)
				run("Flip Vertically");
			if(i&4 == 4)
				run("Rotate... ", "angle=90 grid=0 interpolation=None");
		}
	}

	run("Select None");
	chHeight = getHeight();

	// load array with sum of pixels
	i = 0;
	for(y=0; y<chHeight; y+=2) {
		for(x=0; x<chw; x+=2) {
			p=getPixel(x,y)+getPixel(x+1,y)+getPixel(x,y+1)+getPixel(x+1,y+1);
			p=p/255;
			chMatrix[i]=p;
			i++;
		}
	}
}
