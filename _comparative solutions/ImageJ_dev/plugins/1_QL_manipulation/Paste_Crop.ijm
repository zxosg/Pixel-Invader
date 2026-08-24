// this macro will paste date from system clipboard
// and crop & scale to sinclair ql hires/lores ratio

aspect  = 4/3;
qlmode  = newArray("High res","Low res");
cropps  = newArray("Center-Left","Center","Center-Right");
pastes  = true;

Dialog.create("Preferences")
  Dialog.addChoice("QL Resolution", qlmode, "Low res")
  Dialog.addChoice("Crop position", cropps, "Center")
  Dialog.addNumber("Apect ratio", aspect);
  Dialog.addCheckbox("System clipboard", pastes);
Dialog.show();

qlmode = Dialog.getChoice();
cropps = Dialog.getChoice();
aspect = Dialog.getNumber();
pastes = Dialog.getCheckbox();

if(pastes) {
  run("System Clipboard");
}

w       = getWidth;
h       = getHeight;

if(h*aspect > w)
   h = w/aspect;
else
   w = h*aspect;

run("Canvas Size...", "width="+w+" height="+h+" position="+cropps+" zero");

if(qlmode=="High res") {
   w = 512;
   h = 256;
} else if(qlmode=="Low res") {
   w = 256;
   h = 256;
}

run("Size...", " width="+w+" height="+h+" average interpolation=Bilinear");
run("OsgDither ");
