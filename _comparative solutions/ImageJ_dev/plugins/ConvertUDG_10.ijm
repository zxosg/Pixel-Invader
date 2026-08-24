var outID;
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

// char width and height
var scrw = floor(w/chw);
var scrh = floor(h/chh);
var scrl = scrw*scrh;

// dialog
var chFile = "Q:/Development/Dev-ZX/Graphics/convert/";
var cnvTrans = true;
var cnvSave  = false;

Dialog.create("Select font file");
Dialog.addCheckbox("Transformations", cnvTrans);
Dialog.addCheckbox("Save output", cnvSave);
Dialog.addFile("Path", chFile);
Dialog.show();

cnvTrans = Dialog.getCheckbox();
cnvSave  = Dialog.getCheckbox();
chFile   = Dialog.getString();

var chLen  = File.length(chFile);
var chNum  = chLen/chh;
var matsize = chw/2 * chh/2;
var transf;

if(cnvTrans==true)
	transf = 16;
else
	transf = 2;

var chMatrix = newArray(chNum*matsize*transf);
var chWeight = newArray(chNum*transf);
var chMode	 = newArray(chNum*transf);
var chRank   = newArray(chNum*transf);
var chID;

setBatchMode(true);
loadCharset();
if(cnvSave==true) 
	makeZX();

var px = newArray(matsize);
selectImage(srcID);

for(y=0; y<h; y+=chh) {
	for(x=0; x<w; x+=chw) {
		selectImage(srcID);
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
	if(cnvSave==true) 
		saveChar(x,y);
	}
}
setBatchMode(false);
//selectImage(chID);
//close();
//selectImage(outID);

function makeZX() {
	run("Raw...", "open=[" + chFile + "] image=8-bit width=" + chLen + " height=1");
	run("Canvas Size...", "width=" + 768*2 + chLen+2 + " height=1 position=Top-Right zero");
	outID = getImageID();
// header
// 1B - number of characters in the font
// 1B - reserved (future use)
	setPixel(1536,0,chNum);
	setPixel(1537,0,cnvTrans);
}

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
}

function saveChar(x,y) {
	selectImage(outID);

	if(cnvTrans == true) 
		val = (chRank[0]%chNum)<<3 + chMode[chRank[0]]&7;
	else
		val = chRank[0]%chNum;

	if((chMode[chRank[0]]&8) == 8)
		col = ink*8 + pap;
	else 
		col = pap*8 + ink;

//	print (chRank[0], val, chMode[chRank[0]]&8 );

	setPixel(0   + x/chw + y/chh * scrw, 0, val);
	setPixel(768 + x/chw + y/chh * scrw, 0, col);
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

	if(cnvTrans==true) {

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
	}

	run("Select None");
	chHeight = getHeight();

	// load array with sum of pixels
	i = 0;
	j = 0;
	for(y=0; y<chHeight; y+=2) {
		if(y%chh == 0) {
			chMode[j] = floor(y/chLen/2) + 8*(floor(y/chLen)&1);
			// print(j,chMode[j]);
			j++;
		}
		for(x=0; x<chw; x+=2) {
			p=getPixel(x,y)+getPixel(x+1,y)+getPixel(x,y+1)+getPixel(x+1,y+1);
			p=p/255;
			chMatrix[i]=p;
			i++;
		}
	}
}
