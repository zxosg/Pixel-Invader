c1 = newArray(0, 1, 1, 1, 1, 4, 4, 4, 4, 2, 4, 1, 2, 4, 4, 2, 2, 3, 3, 1, 4, 4, 3, 3, 3, 3, 2, 4, 2, 3, 3, 3, 3, 4, 4, 3, 4);
c2 = newArray(0, 0, 0, 1, 1, 0, 0, 4, 4, 0, 1, 4, 0, 1, 1, 2, 2, 0, 1, 3, 2, 2, 2, 0, 1, 1, 4, 2, 3, 2, 3, 2, 3, 3, 3, 4, 3);
i1 = newArray(0, 1, 2, 2, 2, 1, 2, 2, 2, 1, 1, 2, 2, 2, 2, 2, 2, 1, 1, 2, 1, 2, 1, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 1, 2, 2, 2);
i2 = newArray(0, 0, 0, 1, 2, 0, 0, 1, 2, 0, 1, 1, 0, 1, 2, 1, 2, 0, 1, 1, 1, 1, 1, 0, 1, 2, 1, 2, 1, 1, 1, 2, 2, 1, 1, 1, 2);
pal_rgb = newArray(0x000000, 0x00003F, 0x00007F, 0x0000BF, 0x0000FF, 0x003F00, 0x007F00, 0x00BF00, 0x00FF00, 0x3F0000, 0x003F3F, 0x003F7F, 0x7F0000, 0x007F3F, 0x007F7F, 0xBF0000, 0xFF0000, 0x3F003F, 0x3F007F, 0x3F00BF, 0x3F3F00, 0x3F7F00, 0x7F003F, 0x7F007F, 0x7F00BF, 0x7F00FF, 0x7F3F00, 0x7F7F00, 0xBF003F, 0xBF007F, 0xBF00BF, 0xFF007F, 0xFF00FF, 0x3F3F3F, 0x3F7F3F, 0x7F3F7F, 0x7F7F7F);
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
  dr = 0;

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
  
// print(di);

 dm1 = 0xffffff;  dm2 = 0xffffff;  dm3 = 0xffffff;
 di1 = 0;  di2 = 0;  di3 = 0;

 for(i=0; i<c1.length; i++) {
  if(i==0 || c1[i]==c1[di] && c2[i]==c2[di]) {
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
   } else if(i1[pi[p]]==2) {
    setPixel(x*2 + p*2    , y*2, c1_pmd);
    setPixel(x*2 + p*2 + 1, y*2, c1_pmd);
   } else {
    setPixel(x*2 + p*2    , y*2, 0);
    setPixel(x*2 + p*2 + 1, y*2, 0);
   }


   if(i2[pi[p]]==1) {
    setPixel(x*2 + p*2 + 1, y*2 + 1, c2_pmd);
    setPixel(x*2 + p*2    , y*2 + 1, 0);
   } else if(i2[pi[p]]==2){
    setPixel(x*2 + p*2    , y*2 + 1, c2_pmd);
    setPixel(x*2 + p*2 + 1, y*2 + 1, c2_pmd);
   } else {
    setPixel(x*2 + p*2    , y*2 + 1, 0);
    setPixel(x*2 + p*2 + 1, y*2 + 1, 0);
   }
  }
 }
}
setBatchMode(false);
updateDisplay();

function dist(rgb1, rgb2) {
  rd = pow((rgb1 & 0xff0000 >> 16 - rgb2 & 0xff0000 >> 16),2);
  gd = pow((rgb1 & 0x00ff00 >> 08 - rgb2 & 0x00ff00 >> 08),2);
  bd = pow((rgb1 & 0x0000ff       - rgb2 & 0x0000ff      ),2);
  return (rd+gd+bd);
}
