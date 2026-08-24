run("System Clipboard");

w = getWidth;
h = getHeight;

if (w>h) {
   w2 = round(w/h * 192);
   if (w2<256) {
      h=h/(w/w2);
   }
   run("Size...", " width="+w2+" height=192 constrain average interpolation=Bilinear");
   run("Canvas Size...", "width=256 height=192 position=Center zero");
} else {
   h = round(h/w * 256);
   run("Size...", " width="+256+" height=h constrain average interpolation=Bilinear");
   run("Canvas Size...", "width=256 height=192 position=Center zero");
}
