c1 = newArray(0, 1, 4, 2, 3, 3, 1, 4, 4, 4, 1, 4, 4, 1, 4, 2, 3, 3, 3, 3, 4, 2, 3, 4, 4, 4, 1, 4, 2, 2, 3, 3, 1, 4, 2, 3, 3); 
c2 = newArray(0, 0, 0, 0, 0, 1, 3, 1, 2, 3, 4, 2, 3, 1, 4, 2, 2, 3, 1, 1, 1, 4, 4, 1, 2, 3, 1, 4, 2, 3, 2, 3, 1, 4, 2, 2, 3);
i1 = newArray(1, 1, 1, 1, 1, 1, 2, 1, 1, 1, 2, 2, 2, 1, 1, 1, 1, 1, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2);
i2 = newArray(1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 2, 1, 1, 1, 2, 2, 2, 1, 1, 1, 1, 1, 1, 2, 2, 2, 2, 2);
r  = newArray(0x00, 0x00, 0x00, 0x3F, 0x3F, 0x3F, 0x3F, 0x00, 0x3F, 0x3F, 0x00, 0x40, 0x40, 0x00, 0x00, 0x7F, 0x7F, 0x7F, 0x7F, 0x7F, 0x00, 0x7F, 0x7F, 0x00, 0x7F, 0x7F, 0x00, 0x00, 0xBF, 0xBF, 0xBF, 0xBF, 0x00, 0x00, 0xFF, 0xFF, 0xFF)
g  = newArray(0x00, 0x00, 0x3F, 0xC0, 0xC0, 0xC0, 0xC0, 0x3F, 0xFF, 0xFF, 0x40, 0x3F, 0x3F, 0x00, 0x7F, 0x80, 0x80, 0x80, 0x80, 0x80, 0x7F, 0xBF, 0xC0, 0x7F, 0xFF, 0xFF, 0x00, 0xBF, 0x40, 0x40, 0x40, 0x40, 0x00, 0xFF, 0x00, 0x00, 0x00) 
b  = newArray(0x00, 0x3F, 0xC0, 0x00, 0x3F, 0x7F, 0xBF, 0xFF, 0xC0, 0xFF, 0x3F, 0x80, 0xBF, 0x7F, 0x80, 0x00, 0x3F, 0x7F, 0xBF, 0xFF, 0xBF, 0xC0, 0x3F, 0xFF, 0x80, 0xFF, 0xBF, 0x40, 0x00, 0x3F, 0x7F, 0xBF, 0xFF, 0x00, 0x00, 0x7F, 0xFF) 

m  = newArray(0, 0.5, 1);

// colors of three pixels
r0 = newArray(3);
g0 = newArray(3);
b0 = newArray(3);

// color table for basic PMD colors
r1 = newArray( 0x00, 0x00, 0xff, 0xff, 0x00); 
g1 = newArray( 0x00, 0x00, 0x00, 0x00, 0xff);
b1 = newArray( 0x00, 0xff, 0x00, 0xff, 0x00);

// full / halftone color
r2 = newArray(4);
g2 = newArray(4);
b2 = newArray(4);

// Array.show("PMD Color Mix", c1,c2,i1,i2,r,g,b);

setBatchMode(true);

img0 = getImageID();
wim0 = getWidth();
him0 = getHeight();

newImage("pmd", "rgb", wim0*2, him0*2, 0); 
img1 = getImageID();

for(x=0; x<wim0; x+=3) {
 for(y=0; y<him0; y++) {
  selectImage(img0); 
  c0 = getPixel(x,y);
  r0[0] = c0 & 0xff0000 >> 16;
  g0[0] = c0 & 0x00ff00 >> 8;
  b0[0] = c0 & 0x0000ff;

  c0 = getPixel(x+1,y);
  r0[1] = c0 & 0xff0000 >> 16;
  g0[1] = c0 & 0x00ff00 >> 8;
  b0[1] = c0 & 0x0000ff;

  c0 = getPixel(x+2,y);
  r0[2] = c0 & 0xff0000 >> 16;
  g0[2] = c0 & 0x00ff00 >> 8;
  b0[2] = c0 & 0x0000ff;

  ra = (r0[0] + r0[1] + r0[2])/3;
  ga = (g0[0] + g0[1] + g0[2])/3;
  ba = (b0[0] + b0[1] + b0[2])/3;

//  Array.show(r0,g0,b0);

  dm = 0xffffff;
  di = 0;

  for(i=0; i<r.length; i++) {
   dr = sqrt(pow((ra-r[i]),2) + pow((ga-g[i]),2) + pow((ba-b[i]),2));
   if(dr<dm) {
    dm = dr;
    di = i;
   }   
  }
  
//  print(di);

  dm = 0xffffff;
  da = 0;
  db = 0;

  r2[0] = r1[c1[di]]; r2[1] = r1[c1[di]]>>1;
  g2[0] = g1[c1[di]]; g2[1] = g1[c1[di]]>>1;
  b2[0] = b1[c1[di]]; b2[1] = b1[c1[di]]>>1;

  r2[2] = r1[c2[di]]; r2[3] = r1[c2[di]]>>1;
  g2[2] = g1[c2[di]]; g2[3] = g1[c2[di]]>>1;
  g2[2] = b1[c2[di]]; g2[3] = b1[c2[di]]>>1;

  for(p=0; p<3; p++) {
   for(i=0; i<m.length; i++) {
    for(j=0; j<m.length; j++) {
     dr = sqrt(pow((r0[p]-(m[j]*r1[c1[di]] + m[i]*r1[c2[di]])/2),2) + pow((g0[p]-(m[j]*g1[c1[di]] + m[i]*g1[c2[di]])/2),2) + pow((b0[p]-(m[j]*b1[c1[di]] + m[i]*b1[c2[di]])/2),2));
     if(dr<dm) {
      dm = dr;
      da = i;
      db = j;
     }
    }
   }
   selectImage(img1);

//   print(c1[di]+" "+r1[c1[di]]+" "+g1[c1[di]]+" "+b1[c1[di]]);
//   print(c2[di]+" "+r1[c2[di]]+" "+g1[c2[di]]+" "+b1[c2[di]]);

   if(da==1) {
    setPixel(x*2 + p*2    , y*2, r1[c1[di]]<<16 + g1[c1[di]]<<8 + b1[c1[di]]);
    setPixel(x*2 + p*2 + 1, y*2, 0);
   } else if(da==2) {
    setPixel(x*2 + p*2    , y*2, r1[c1[di]]<<16 + g1[c1[di]]<<8 + b1[c1[di]]);
    setPixel(x*2 + p*2 + 1, y*2, r1[c1[di]]<<16 + g1[c1[di]]<<8 + b1[c1[di]]);
   } else if(da==0) {
    setPixel(x*2 + p*2    , y*2, 0);
    setPixel(x*2 + p*2 + 1, y*2, 0);
   }

   if(db==1) {
    setPixel(x*2 + p*2 + 1, y*2 + 1, r1[c2[di]]<<16 + g1[c2[di]]<<8 + b1[c2[di]]);
    setPixel(x*2 + p*2    , y*2 + 1, 0);
   } else if(db==2) {
    setPixel(x*2 + p*2    , y*2 + 1, r1[c2[di]]<<16 + g1[c2[di]]<<8 + b1[c2[di]]);
    setPixel(x*2 + p*2 + 1, y*2 + 1, r1[c2[di]]<<16 + g1[c2[di]]<<8 + b1[c2[di]]);
   } else if(db==0) {
    setPixel(x*2 + p*2    , y*2 + 1, 0);
    setPixel(x*2 + p*2 + 1, y*2 + 1, 0);
   }
  }
 }
}
setBatchMode(false);
updateDisplay();
