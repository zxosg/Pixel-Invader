// This macro demonstrates how to use the Image>Overlay>Add Selection
// command to draw a line grid on an image in a non-destructive overlay.

   requires("1.43j");
   color = "red";
   nLines = 20;
   if (nImages==0) exit ("No argument!");
   run("Remove Overlay");

   gX = 8;
   gY = 2;

   width = getWidth;
   height = getHeight;

   for (x=0; x<width; x+=gX) {
      makeLine(x, 0, x, height);
      run("Add Selection...", "stroke="+color);
   }
   for (y=0; y<height; y+=gY) {
      makeLine(0, y, width, y);
      run("Add Selection...", "stroke="+color);
   }

run("Select None");
