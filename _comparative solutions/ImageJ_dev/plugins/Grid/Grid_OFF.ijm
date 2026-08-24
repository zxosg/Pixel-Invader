// This macro demonstrates how to use the Image>Overlay>Add Selection
// command to draw a line grid on an image in a non-destructive overlay.

   requires("1.43j");
   color = "red";
   nLines = 20;
   if (nImages==0) exit ("No argument!");
   run("Remove Overlay");