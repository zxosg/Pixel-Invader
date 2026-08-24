c1 = newArray(0, 1, 4, 2, 3, 3, 1, 4, 4, 4, 1, 4, 4, 1, 4, 2, 3, 3, 3, 3, 4, 2, 3, 4, 4, 4, 1, 4, 2, 2, 3, 3, 1, 4, 2, 3, 3); 
c2 = newArray(0, 0, 0, 0, 0, 1, 3, 1, 2, 3, 4, 2, 3, 1, 4, 2, 2, 3, 1, 1, 1, 4, 4, 1, 2, 3, 1, 4, 2, 3, 2, 3, 1, 4, 2, 2, 3);
i1 = newArray(1, 1, 1, 1, 1, 1, 2, 1, 1, 1, 2, 2, 2, 1, 1, 1, 1, 1, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2);
i2 = newArray(1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 2, 1, 1, 1, 2, 2, 2, 1, 1, 1, 1, 1, 1, 2, 2, 2, 2, 2);
pal_rgb = newArray(0x0, 0x3F, 0x3FC0, 0x3FC000, 0x3FC03F, 0x3FC07F, 0x3FC0BF, 0x3FFF, 0x3FFFC0, 0x3FFFFF, 0x403F, 0x403F80, 0x403FBF, 0x7F, 0x7F80, 0x7F8000, 0x7F803F, 0x7F807F, 0x7F80BF, 0x7F80FF, 0x7FBF, 0x7FBFC0, 0x7FC03F, 0x7FFF, 0x7FFF80, 0x7FFFFF, 0xBF, 0xBF40, 0xBF4000, 0xBF403F, 0xBF407F, 0xBF40BF, 0xFF, 0xFF00, 0xFF0000, 0xFF007F, 0xFF00FF);
pmd_rgb = newArray(0x000000, 0x0000ff, 0xff0000, 0xff00ff, 0x00ff00);

pi = newArray(3);

// Array.show("PMD Color Mix", c1,c2,i1,i2,r,g,b);

setBatchMode(true);

img0 = getImageID();
wim0 = getWidth();
him0 = getHeight();

newImage("pmd", "rgb", wim0*2, him0*2, 0); 
img1 = getImageID();

for(x=0; x<wim0; x+=3+++) {
 for(y=0; y<him0; y++) {
  selectImage(img0); 

  dm = 0xffffff;
  di = 0;

  for(i=0; i<c1.length; i++) {

   dr = 0;
   ds = dist(pal_rgb[i],getPixel(x,y));
   if(dist(0,getPixel(x,y))>ds) {
     dr = dr + ds;
   }

   ds = dist(pal_rgb[i],getPixel(x+1,y));
   if(dist(0,getPixel(x+1,y))>ds) {
     dr = dr + ds;
   }

   ds = dist(pal_rgb[i],getPixel(x+2,y));
   if(dist(0,getPixel(x+2,y))>ds) {
     dr = dr + ds;
   }

   if(dr<dm && dr>0) {
    dm = dr;
    di = i;
   }   
  }
  
//  print(di);

 dm1 = 0xffffff;  dm2 = 0xffffff;  dm3 = 0xffffff;
 di1 = 0;  di2 = 0;  di3 = 0;

 for(i=0; i<c1.length; i++) {
  if(c1[i]==c1[di] && c2[i]==c2[di]) {
   dr1 = dist(pal_rgb[i],getPixel(x,y));
   dr2 = dist(pal_rgb[i],getPixel(x+1,y));
   dr3 = dist(pal_rgb[i],getPixel(x+2,y));

   if(dr1<dm1) {
    dm1 = dr1;
    pi[0] = i;
   }
   if(dr2<dm2) {
    dm2 = dr2;
    pi[1] = i;
   }
   if(dr3<dm3) {
    dm3 = dr3;
    pi[2] = i;
   }
  }
 }

  c1_pmd = pmd_rgb[c1[di]];
  c2_pmd = pmd_rgb[c2[di]];

  selectImage(img1);

  for(p=0; p<3 ; p++) {
   if(i1[pi[p]]==1) {
    setPixel(x*2 + p*2    , y*2, c1_pmd);
    setPixel(x*2 + p*2 + 1, y*2, 0);
   } else {
    setPixel(x*2 + p*2    , y*2, c1_pmd);
    setPixel(x*2 + p*2 + 1, y*2, c1_pmd);
   }

   if(i2[pi[p]]==1) {
    setPixel(x*2 + p*2 + 1, y*2 + 1, c2_pmd);
    setPixel(x*2 + p*2    , y*2 + 1, 0);
   } else {
    setPixel(x*2 + p*2    , y*2 + 1, c2_pmd);
    setPixel(x*2 + p*2 + 1, y*2 + 1, c2_pmd);
   }
  }
 }
}
setBatchMode(false);
updateDisplay();

function dist(rgb1, rgb2) {
  rd = pow((rgb1>>16 & 0xff - rgb2>>16 & 0xff),2);
  gd = pow((rgb1>>8  & 0xff - rgb2>>8  & 0xff),2);
  bd = pow((rgb1     & 0xff - rgb2     & 0xff),2);
  return floor(sqrt(rd+gd+bd));
}
