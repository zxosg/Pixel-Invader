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
var chNum  = chLen/8;
var chMatrix = newArray(chNum*chw/2*chh/2);
var chWeight = newArray(chNum);
var chRank   = newArray(chNum);
var chWeightInv = newArray(chNum);
var chRankInv   = newArray(chNum);
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
			dif2=dif2+abs(px[a]-(4-chMatrix[a+b]));
		}
		chWeight[iw] = diff;
		chWeightInv[iw]=dif2;
		iw++;
	}
	chRank = Array.rankPositions(chWeight);
	chRankInv = Array.rankPositions(chWeightInv);
}

function drawChar(x,y) {
	selectImage(chID);

	if (chRank[1]>chRankInv[1]) {
		char=chRankInv[1];
		inv = 1;
	} else {
		char = chRank[1];
		inv = 0;
	}

	makeRectangle(0,char*chh,chw,chh);
	Image.copy;
	selectImage(dstID);
	Image.paste(x,y);
	makeRectangle(x,y,chw,chh);
	if(inv==1) {
		changeValues(0,0,pap);
		changeValues(255,255,ink);
	} else {
		changeValues(0,0,ink);
		changeValues(255,255,pap);
	}
	selectImage(srcID);
}

function loadCharset() {
	run("Raw...", "open=[" + chFile + "] image=[1-bit Bitmap] width=" + chw + " height=" +chLen);
	chID = getImageID();

	// load array with sum of pixels

	i = 0;
	for(y=0; y<chLen; y+=2) {
		for(x=0; x<chw; x+=2) {
			p=getPixel(x,y)+getPixel(x+1,y)+getPixel(x,y+1)+getPixel(x+1,y+1);
			p=p/255;
			chMatrix[i]=p;
			i++;
		}
	}
}
