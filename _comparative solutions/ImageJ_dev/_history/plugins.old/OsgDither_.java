import ij.IJ;
import ij.ImagePlus;
import ij.WindowManager;
import ij.gui.GenericDialog;
import ij.gui.NewImage;
import ij.io.OpenDialog;
import ij.io.Opener;
import ij.plugin.filter.PlugInFilter;
import ij.process.ImageProcessor;

import java.awt.image.ColorModel;
import java.awt.image.IndexColorModel;
import java.util.Random;


/**
	Floyd-Steinberg, Sierra and Ordered Dithering
	ImageJ plug-in
	(C) osg^patisoners 2007, 2008 
	
	Greets to Poke, JSH, FCR6
	
	some portions of the code and inspiration from: 
		Jimi_Reader.java
		Lut_Importer.java
		Inverter.java
*/

public class OsgDither_ implements PlugInFilter {
// public class OsgDither_ implements PlugIn {
	
	static boolean fullfloat = true;
	static boolean randomize = false;
	static boolean preview   = true;
	static boolean keeppal	 = false;
	static boolean forceblack= true;
	static int randomizer = 3; 
	static byte mode = 5;		
		 byte	lastmode;
	static byte dalg = 3;	// 0 - FS, 1 - Sierra2
	static int  dither = 64;
	static double gamma = 100;
	String plist[] = {"QL HiColour Low Resolution","QL HiColour High Resolution","QL HiColour Mixed Resolution", "8 col (*) (ZX, QL Low res)","4 col (*) (QL High res)","Binary (*)","3 levels monochrome (*)" ,"File: Indexed image", "File: LUT ", "Dither to selective colors (*)"};
	String dalgm[] = {"ED: Floyd-Steinberg", "ED: Sierra 2", "Ordered: Smooth 2x1", "Ordered: Bayer 2x2", "Ordered: 3x3","Ordered: Bayer 4x4","Ordered: Bayer 8x8"};
	static byte[] Rpal = new byte[256];
	static byte[] Gpal = new byte[256];
	static byte[] Bpal = new byte[256];
	static boolean[] Cpal = new boolean[8];
	static int mapSize = 0;
	static int rgbl = 128;
	static int rgbh = 255;
	int dthidimg;
	int dthid = 0;
	int atrid = 0;
	public int gtab[] = new int[256];	// gamma table
	public int ptab[][] = new int[256][256];
	public int rtab[][] = new int[256][256];
	public int pattLevels = 3;
	public int pattX = 3;
	public int pattY = 3;
	public int p[][] = new int[16][16];
	public int divisor;
	public int md = 0x10000000;
	public String wintitle = "";
	
    public int setup(String arg, ImagePlus imp) {
        if (arg.equals("about"))
            {showAbout(); return DONE;}
        return DOES_ALL;
    }

    public void run(ImageProcessor ip) {
    	ImagePlus imp = WindowManager.getCurrentImage(); 
	wintitle = imp.getTitle();
	if(imp.getType()!=ImagePlus.COLOR_RGB) {
    		ip = ip.convertToRGB();
    	}
    	do {
    		lastmode = mode;
    		GenericDialog gd = new GenericDialog("Omega's Color Reducer", IJ.getInstance());
    		gd.addChoice("Palette:", plist, plist[mode]);
		gd.addChoice("Dither algorithm:", dalgm, dalgm[dalg]);
	    	gd.addSlider("Dither level:", 0, 100, dither);
	    	gd.addSlider("Randomize level:", 0, 255, randomizer);
	    	gd.addSlider("Gamma (100 = 1.0):", 0, 400, gamma);
	    	gd.addSlider("RGB lo level (*):", 1, 255, rgbl);
	    	gd.addSlider("RGB hi level (*):", 1, 255, rgbh);
	    	gd.addCheckbox("Force black (*) (RGB = 0)",forceblack);
	    	gd.addCheckbox("Full float (FP error division)",fullfloat);
		gd.addCheckbox("Randomize (biasing with random value)",randomize);
		gd.addCheckbox("Keep palette in memory (Lut or Indexed image)",keeppal);
		gd.addCheckbox("Preview",preview);
		gd.addMessage("Selective colors");
		gd.addCheckbox("Black",  Cpal[0]);
		gd.addCheckbox("Blue",   Cpal[1]);
		gd.addCheckbox("Red",    Cpal[2]);
		gd.addCheckbox("Magenta",Cpal[3]);
		gd.addCheckbox("Green",  Cpal[4]);
		gd.addCheckbox("Cyan",   Cpal[5]);
		gd.addCheckbox("Yellow", Cpal[6]);
		gd.addCheckbox("White",  Cpal[7]);
		
		// gd.addMessage("Attribute");
		// gd.addCheckbox("Enabled", Attr);
		// gd.addSlider("Height:", 1, 8, AttrHeight);
		
		gd.showDialog();
	
		if (gd.wasCanceled())
				return;
		mode 		= (byte)gd.getNextChoiceIndex();
		dalg 		= (byte)gd.getNextChoiceIndex();
		forceblack	= gd.getNextBoolean();
		fullfloat 	= gd.getNextBoolean();
		randomize 	= gd.getNextBoolean();
		keeppal	= gd.getNextBoolean();
		dither 	= (int)gd.getNextNumber();
		randomizer 	= (int)gd.getNextNumber();
		gamma		= (double)gd.getNextNumber();
		rgbl 		= (int)gd.getNextNumber();
		rgbh 		= (int)gd.getNextNumber();
		preview 	= gd.getNextBoolean();

		for (int i=0;i<8;i++) {
			Cpal[i] = gd.getNextBoolean();
		}

		// Attr 		= gd.getNextBoolean();
		// AttrHeight	= (int)gd.getNextNumber();
			
		if(rgbl>rgbh)
			rgbl = rgbh;
		if(dthid!=0)
			WindowManager.getImage(dthid).close();

    		makeGammaTable(gamma,gtab);
    		
		if ((lastmode!=mode) || (mapSize==0) || (keeppal==false))
			mapSize = IniRGBPalette(mode);
		if (mapSize==0) {
    			IJ.error("Pallette size error");
		    	return;
	   	}
		// if (mode==3) {
		// 	atrid = ditherRGBImage(ip);
		//  	dthid = patternRGBImage2(ip, dalg-2);
		//}
		if (dalg<2) {
			dthid = ditherRGBImage(ip);
		} else {
			dthid = patternRGBImage(ip, dalg-2);
		}
    		IJ.run("Cascade");
//    		IJ.run("Tile");
    	} while (preview);
     }
    
    public int ditherRGBImage(ImageProcessor ip) {
		int[] pixels = (int[])ip.getPixels();
		int width 	= ip.getWidth();
		int height 	= ip.getHeight();
		float Rerrd[][] = new float[width+6][4];
		float Gerrd[][] = new float[width+6][4];
		float Berrd[][] = new float[width+6][4];
		int r, g, b, rp, gp, bp, Rdiff, Bdiff, Gdiff, offset, i, c, a, Index, x, minDst, dstSq;
		boolean direction;
		float d100, d1600, Rerr, Gerr, Berr;
		
		ImagePlus dth = NewImage.createImage(wintitle+"_", width, height, 1, 8,0);
		IndexColorModel cm = new IndexColorModel(8, mapSize, Rpal, Gpal, Bpal);
		dth.getProcessor().setColorModel(cm);
		dth.show();
		ImageProcessor dp = dth.getProcessor();
		byte[] dthpix = (byte[])dp.getPixels();

		Random rnd = new Random(1);
		Index  = 0;
		d100   = (float)dither/100; 
		d1600  = (float)dither/1600; // dither/100 * 1/16

// 		random errors in [-1 .. 1] - for first row
//		for (int col = 0; col < width + 6; ++col )
//		{
//			Rerrd[col][0] = 8*(Math.abs(rnd.nextFloat()));
//			Gerrd[col][0] = 8*(Math.abs(rnd.nextFloat()));
//			Berrd[col][0] = 8*(Math.abs(rnd.nextFloat()));
//		}
		
		for (int y=0; y<height; y++) {
           	offset = y*width;
           	direction = (y&1)==1;
           	Rerrd[1      ][(y+2)&3] =128*(Math.abs(rnd.nextFloat())); Gerrd[1      ][(y+2)&3] =128*(Math.abs(rnd.nextFloat())); Berrd[1      ][(y+2)&3] =128*(Math.abs(rnd.nextFloat()));
			Rerrd[width+3][(y+2)&3] =128*(Math.abs(rnd.nextFloat())); Gerrd[width+3][(y+2)&3] =128*(Math.abs(rnd.nextFloat())); Berrd[width+3][(y+2)&3] =128*(Math.abs(rnd.nextFloat()));
           	Rerrd[0      ][(y+2)&3] =128*(Math.abs(rnd.nextFloat())); Gerrd[0      ][(y+2)&3] =128*(Math.abs(rnd.nextFloat())); Berrd[0      ][(y+2)&3] =128*(Math.abs(rnd.nextFloat()));
			Rerrd[width+4][(y+2)&3] =128*(Math.abs(rnd.nextFloat())); Gerrd[width+4][(y+2)&3] =128*(Math.abs(rnd.nextFloat())); Berrd[width+4][(y+2)&3] =128*(Math.abs(rnd.nextFloat()));

            	for (int xx=0; xx<width; xx++) {

            	if (direction) {
            		x = xx;
            	} else {
            		x = width-1-xx;
            	}
            	i = offset + x;
                c = pixels[i];

				r = gtab[c>>16&0xff];
 				g = gtab[c>> 8&0xff]; 
				b = gtab[c    &0xff];
				
				r = h(r, Rerrd[x+2][y&3]);
				g = h(g, Gerrd[x+2][y&3]);
				b = h(b, Berrd[x+2][y&3]);

				minDst = md;
				for(a=0; a<mapSize; a++) {
					
					rp = Rpal[a]&0xff;
					gp = Gpal[a]&0xff;
					bp = Bpal[a]&0xff;

					Rdiff = r - rp;
					Gdiff = g - gp;
					Bdiff = b - bp;

					dstSq = Rdiff*Rdiff + Gdiff*Gdiff + Bdiff*Bdiff;

					if (dstSq < minDst) {
						minDst = dstSq;
						Index = a;
					}
				}

				rp = Rpal[Index]&0xff;
				gp = Gpal[Index]&0xff;
				bp = Bpal[Index]&0xff;

				if(fullfloat) {
					Rerr	= d1600*(float)(r - rp);
					Gerr	= d1600*(float)(g - gp);
					Berr	= d1600*(float)(b - bp);
				} else {
					Rerr	= d100*(float)((r - rp)>>4);
					Gerr	= d100*(float)((g - gp)>>4);
					Berr	= d100*(float)((b - bp)>>4);
				}
				if (direction) {
					if (dalg==0) {
						Rerrd[x+3][ y&3   ]+=Rerr*7; Gerrd[x+3][ y&3   ]+=Gerr*7; Berrd[x+3][ y&3   ]+=Berr*7;
						Rerrd[x+1][(y+1)&3]+=Rerr*3; Gerrd[x+1][(y+1)&3]+=Gerr*3; Berrd[x+1][(y+1)&3]+=Berr*3;
						Rerrd[x+2][(y+1)&3]+=Rerr*5; Gerrd[x+2][(y+1)&3]+=Gerr*5; Berrd[x+2][(y+1)&3]+=Berr*5;
						Rerrd[x+3][(y+1)&3]+=Rerr*1; Gerrd[x+3][(y+1)&3]+=Gerr*1; Berrd[x+3][(y+1)&3]+=Berr*1;
					} else if (dalg==1) {
						Rerrd[x+3][y&3    ]+=Rerr*4; Gerrd[x+3][y&3    ]+=Gerr*4; Berrd[x+3][y&3    ]+=Berr*4;
						Rerrd[x+4][y&3    ]+=Rerr*3; Gerrd[x+4][y&3    ]+=Gerr*3; Berrd[x+4][y&3    ]+=Berr*3;
						Rerrd[x  ][(y+1)&3]+=Rerr*1; Gerrd[x  ][(y+1)&3]+=Gerr*1; Berrd[x  ][(y+1)&3]+=Berr*1;
						Rerrd[x+1][(y+1)&3]+=Rerr*2; Gerrd[x+1][(y+1)&3]+=Gerr*2; Berrd[x+1][(y+1)&3]+=Berr*2;
						Rerrd[x+2][(y+1)&3]+=Rerr*3; Gerrd[x+2][(y+1)&3]+=Gerr*3; Berrd[x+2][(y+1)&3]+=Berr*3;
						Rerrd[x+3][(y+1)&3]+=Rerr*2; Gerrd[x+3][(y+1)&3]+=Gerr*2; Berrd[x+3][(y+1)&3]+=Berr*2;
						Rerrd[x+4][(y+1)&3]+=Rerr*1; Gerrd[x+4][(y+1)&3]+=Gerr*1; Berrd[x+4][(y+1)&3]+=Berr*1;
					}
				} else {
					if (dalg==0) {
						Rerrd[x+1][ y&3   ]+=Rerr*7; Gerrd[x+1][ y&3   ]+=Gerr*7; Berrd[x+1][ y&3   ]+=Berr*7;
						Rerrd[x+3][(y+1)&3]+=Rerr*3; Gerrd[x+3][(y+1)&3]+=Gerr*3; Berrd[x+3][(y+1)&3]+=Berr*3;
						Rerrd[x+2][(y+1)&3]+=Rerr*5; Gerrd[x+2][(y+1)&3]+=Gerr*5; Berrd[x+2][(y+1)&3]+=Berr*5;
						Rerrd[x+1][(y+1)&3]+=Rerr*1; Gerrd[x+1][(y+1)&3]+=Gerr*1; Berrd[x+1][(y+1)&3]+=Berr*1;
					} else if (dalg==1) {
						Rerrd[x+1][y&3    ]+=Rerr*4; Gerrd[x+1][y&3    ]+=Gerr*4; Berrd[x+1][y&3    ]+=Berr*4;
						Rerrd[x+0][y&3    ]+=Rerr*3; Gerrd[x+0][y&3    ]+=Gerr*3; Berrd[x+0][y&3    ]+=Berr*3;
						Rerrd[x+4][(y+1)&3]+=Rerr*1; Gerrd[x+4][(y+1)&3]+=Gerr*1; Berrd[x+4][(y+1)&3]+=Berr*1;
						Rerrd[x+3][(y+1)&3]+=Rerr*2; Gerrd[x+3][(y+1)&3]+=Gerr*2; Berrd[x+3][(y+1)&3]+=Berr*2;
						Rerrd[x+2][(y+1)&3]+=Rerr*3; Gerrd[x+2][(y+1)&3]+=Gerr*3; Berrd[x+2][(y+1)&3]+=Berr*3;
						Rerrd[x+1][(y+1)&3]+=Rerr*2; Gerrd[x+1][(y+1)&3]+=Gerr*2; Berrd[x+1][(y+1)&3]+=Berr*2;
						Rerrd[x+0][(y+1)&3]+=Rerr*1; Gerrd[x+0][(y+1)&3]+=Gerr*1; Berrd[x+0][(y+1)&3]+=Berr*1;
					}
				}
				if(randomize) {
					Rerrd[x+2][(y+2)&3] = randomizer*(Math.abs(rnd.nextFloat())); Gerrd[x+2][(y+2)&3] = randomizer*(Math.abs(rnd.nextFloat())); Berrd[x+2][(y+2)&3] = randomizer*(Math.abs(rnd.nextFloat()));
				} else {
					Rerrd[x+2][(y+2)&3] =0; Gerrd[x+2][(y+2)&3] =0; Berrd[x+2][(y+2)&3] =0;
				}
				dthpix[i] = (byte)Index;
			}
            IJ.showProgress(y, height);
		}
		dth.updateAndDraw();
		return dth.getID();
    }

    public int patternRGBImage(ImageProcessor ip, int pattern) {
		int[] pixels = (int[])ip.getPixels();
		int width 	= ip.getWidth();
		int height 	= ip.getHeight();

		int Rdiff, Bdiff, Gdiff, offset, r, g, b, c, i;
		int minDst1, curDst;
		int r1, r2, g1, g2, b1, b2;
		int Col1 = 0, Col2 = 0, Patt = 0;
		iniPattern(pattern);
		makeLevelTable(pattLevels);
		
		ImagePlus dth = NewImage.createImage(wintitle+"_", width, height, 1, 8,0);
		IndexColorModel cm = new IndexColorModel(8, mapSize, Rpal, Gpal, Bpal);
		dth.getProcessor().setColorModel(cm);
		dth.show();
		ImageProcessor dp = dth.getProcessor();
		byte[] dthpix = (byte[])dp.getPixels();
		
		for (int y=0; y<height; y++) {
			offset = y*width;
			for (int x=0; x<width; x++) {

            	i = offset + x;
                c = pixels[i];

				r = gtab[c>>16&0xff];
 				g = gtab[c>> 8&0xff]; 
				b = gtab[c    &0xff];

				minDst1 = md;

				for(int c1=0; c1<mapSize; c1++) {
					r1 = Rpal[c1]&0xff; g1 = Gpal[c1]&0xff; b1 = Bpal[c1]&0xff;
					for(int c2=0; c2<mapSize; c2++) {
						r2 = Rpal[c2]&0xff; g2 = Gpal[c2]&0xff; b2 = Bpal[c2]&0xff;
						for(int ll=0; ll<pattLevels; ll++) {
																				
							Rdiff = r - (ptab[pattLevels-ll][r1] + ptab[ll][r2]);
							Gdiff = g - (ptab[pattLevels-ll][g1] + ptab[ll][g2]);
							Bdiff = b - (ptab[pattLevels-ll][b1] + ptab[ll][b2]);
							
							curDst = Rdiff*Rdiff + Gdiff*Gdiff + Bdiff*Bdiff;
					
							if (minDst1 > curDst) {
								minDst1 = curDst;
								Col1 = c1;
								Col2 = c2;
								Patt = ll;
							}
						}
					}
				}

				if (p[x%pattX][y%pattY] > Patt) {
					dthpix[i] = (byte)Col1;
				} else {
					dthpix[i] = (byte)Col2;
				}
			}
            IJ.showProgress(y, height);
		}
		dth.updateAndDraw();
		return dth.getID();
    }

    public int patternRGBImage2(ImageProcessor ip, int pattern) {
		int[] pixels = (int[])ip.getPixels();
		int width 	= ip.getWidth();
		int height 	= ip.getHeight();

		int Rdiff, Bdiff, Gdiff, offset, r, g, b, c, i;
		int minDst1, curDst;
		int r1, r2, g1, g2, b1, b2;
		int Col1 = 0, Col2 = 0, Patt = 0;
		iniPattern(pattern);
		makeLevelTable(pattLevels);
		
		ImagePlus dth = NewImage.createImage(wintitle+"_", width, height, 1, 8,0);
		IndexColorModel cm = new IndexColorModel(8, mapSize, Rpal, Gpal, Bpal);
		dth.getProcessor().setColorModel(cm);
		dth.show();
		ImageProcessor dp = dth.getProcessor();
		byte[] dthpix = (byte[])dp.getPixels();
		
		for (int y=0; y<height; y++) {
			offset = y*width;
			for (int x=0; x<width; x++) {

            	i = offset + x;
                c = pixels[i];

				r = gtab[c>>16&0xff];
 				g = gtab[c>> 8&0xff]; 
				b = gtab[c    &0xff];

				minDst1 = md;

				for(int c1=0; c1<mapSize; c1++) {
					r1 = Rpal[c1]&0xff; g1 = Gpal[c1]&0xff; b1 = Bpal[c1]&0xff;
					for(int c2=0; c2<mapSize; c2++) {
						r2 = Rpal[c2]&0xff; g2 = Gpal[c2]&0xff; b2 = Bpal[c2]&0xff;
						for(int ll=0; ll<pattLevels; ll++) {
																				
							Rdiff = r - (ptab[pattLevels-ll][r1] + ptab[ll][r2]);
							Gdiff = g - (ptab[pattLevels-ll][g1] + ptab[ll][g2]);
							Bdiff = b - (ptab[pattLevels-ll][b1] + ptab[ll][b2]);
							
							curDst = Rdiff*Rdiff + Gdiff*Gdiff + Bdiff*Bdiff;
					
							if (minDst1 > curDst) {
								minDst1 = curDst;
								Col1 = c1;
								Col2 = c2;
								Patt = ll;
							}
						}
					}
				}

				if (p[x%pattX][y%pattY] > Patt) {
					dthpix[i] = (byte)Col1;
				} else {
					dthpix[i] = (byte)Col2;
				}
			}
            IJ.showProgress(y, height);
		}
		dth.updateAndDraw();
		return dth.getID();
    }

    public int patternRGBImageDev(ImageProcessor ip, int pattern) {
		int[] pixels = (int[])ip.getPixels();
		int width 	= ip.getWidth();
		int height 	= ip.getHeight();

		int Rdiff, Bdiff, Gdiff, offset, r, g, b, c, i;
		int minDst1, curDst;
		int r1, r2, g1, g2, b1, b2;
		int Col1 = 0, Col2 = 0, Patt = 0;
		int Rerr = 0, Berr = 0, Gerr = 0;
		iniPattern(pattern);
		makeLevelTableFull(pattLevels);
		
		ImagePlus dth = NewImage.createImage(wintitle+"_", width, height, 1, 8,0);
		IndexColorModel cm = new IndexColorModel(8, mapSize, Rpal, Gpal, Bpal);
		dth.getProcessor().setColorModel(cm);
		dth.show();
		ImageProcessor dp = dth.getProcessor();
		byte[] dthpix = (byte[])dp.getPixels();
		
		for (int y=0; y<height; y++) {
			offset = y*width;
			for (int x=0; x<width; x++) {

            	i = offset + x;
                c = pixels[i];

				r = i(gtab[c>>16&0xff],Rerr);
 				g = i(gtab[c>> 8&0xff],Gerr); 
				b = i(gtab[c    &0xff],Berr);

				minDst1 = md;

				for(int c1=0; c1<mapSize; c1++) {
					r1 = Rpal[c1]&0xff; g1 = Gpal[c1]&0xff; b1 = Bpal[c1]&0xff;
					for(int c2=0; c2<mapSize; c2++) {
						r2 = Rpal[c2]&0xff; g2 = Gpal[c2]&0xff; b2 = Bpal[c2]&0xff;
						for(int ll=0; ll<pattLevels; ll++) {
																				
							Rdiff = r - (ptab[pattLevels-ll][r1] + ptab[ll][r2]);
							Gdiff = g - (ptab[pattLevels-ll][g1] + ptab[ll][g2]);
							Bdiff = b - (ptab[pattLevels-ll][b1] + ptab[ll][b2]);
							
							curDst = Rdiff*Rdiff + Gdiff*Gdiff + Bdiff*Bdiff;
					
							if (minDst1 > curDst) {
								minDst1 = curDst;
								Col1 = c1;
								Col2 = c2;
								Patt = ll;
							}
						}
					}
				}

				r1 = (ptab[pattLevels-Patt][Rpal[Col1]&0xff] + ptab[Patt][Rpal[Col2]&0xff]);
				g1 = (ptab[pattLevels-Patt][Gpal[Col1]&0xff] + ptab[Patt][Gpal[Col2]&0xff]);
				b1 = (ptab[pattLevels-Patt][Bpal[Col1]&0xff] + ptab[Patt][Bpal[Col2]&0xff]);
				
				Rerr = (r - r1)*dither/200; 
				Berr = (b - b1)*dither/200; 
				Gerr = (g - g1)*dither/200;
				
				if (p[x%pattX][y%pattY] > Patt) {
					dthpix[i] = (byte)Col1;
				} else {
					dthpix[i] = (byte)Col2;
				}
			}
            IJ.showProgress(y, height);
		}
		dth.updateAndDraw();
		return dth.getID();
    }

  void showAbout() {
        IJ.showMessage("About Osg Color Reducer_...",
            "This plug-in dithers an image into fixed colour palette.\n" +
            "Palette can be read from LUT file or another indexed image.\n" +
            "There are already various palette pre-sets that are related\n" +
            "to Sinclair QL and ZX Spectrum screen modes.\n" +
            "V 1.2 (C) 2007-2009 Omega of Patisoners\n"
        );
    }

  public void makeGammaTable(double g, int[] table) {
	  float gamma = (float)g/100;
	  double maxVal = Math.pow((double)255,1/gamma);
	  for (int i=0; i<256; i++) {
		  double result = Math.pow((double)i, 1/gamma)/maxVal*256;
		  table[i] = (int)result;
	  }
  }
  
  public void makeLevelTable(int pattLevels) {
	  int k1 = ((100-dither)*64)/100;
	  for(int i=0; i<=pattLevels; i++) {
		  for(int j=0; j<256; j++) {
			  ptab[i][j] = i*j/pattLevels*dither/100 + k1;
		  }
	  }
  }

  public void makeLevelTableFull(int pattLevels) {
	  for(int i=0; i<=pattLevels; i++) {
		  for(int j=0; j<256; j++) {
			  ptab[i][j] = i*j/pattLevels;
		  }
	  }
  }

  public int h(int a, float b) {
	int v = a + (int)b;
	if (v>255) {
//		IJ.write(">255");
		return 255;
	} else if (v<0) {
//		IJ.write("less than 0 "+v);
		return 0;
	} else {
		return v;
	}
  }

  public int i(int a, int b) {
	  int v = a + b;
	  if(v>0xff) return 0xff;
	  //if(v<0) 	 return 0x00;
	  			 return v;
  }
  
  public int IniRGBPalette(byte mode) {
	  float rgbv = 0;
	  float rgbi = 0;
	  int[] R = new int[8];
	  int[] G = new int[8];
	  int[] B = new int[8];
	  int[] L = {0,2,4,7};
	  int p = 0;
	  int blak;
	  
		if (forceblack) {
			rgbi = (float)(rgbh-rgbl)/7;
			R[000]=0x00; G[000]=0x00; B[000]=0x00;
			rgbv = rgbl;
			blak = 0x00;
		} else {
			rgbi = (float)(rgbh-rgbl)/8;
			R[000]=rgbl; G[000]=rgbl; B[000]=rgbl;
			rgbv = rgbl + rgbi;
			blak = rgbl;
		}
		R[001]=blak; 		G[001]=blak; 		B[001]=(int) rgbv; 	rgbv += rgbi;
		R[002]=(int) rgbv; 	G[002]=blak; 		B[002]=blak; 		rgbv += rgbi;
		R[003]=(int) rgbv; 	G[003]=blak; 		B[003]=(int) rgbv; 	rgbv += rgbi;
		R[004]=blak; 		G[004]=(int) rgbv; 	B[004]=blak; 		rgbv += rgbi;
		R[005]=blak; 		G[005]=(int) rgbv; 	B[005]=(int) rgbv; 	rgbv += rgbi;
		R[006]=(int) rgbv; 	G[006]=(int) rgbv; 	B[006]=blak; 		rgbv += rgbi;
		R[007]=(int) rgbv; 	G[007]=(int) rgbv; 	B[007]=(int) rgbv; 
  
	  for(int i=0; i<256; i++) {
		  Rpal[i]=0;Gpal[i]=0;Bpal[i]=0;
	  }
	if(mode==0) {			// lores		
		for(int i=0; i<8; i++) {
			for(int j=0; j<8; j++) {
				Rpal[p] = (byte)((R[i] + R[j])>>1);
				Gpal[p] = (byte)((G[i] + G[j])>>1);
				Bpal[p] = (byte)((B[i] + B[j])>>1);
				p++;
			}
		}
		return 64; // 8*8
	} else if(mode==1) { 		// hires		
		for(int i=0; i<4; i++) {
			for(int j=0; j<4; j++) {
				Rpal[p] = (byte)((R[L[i]] + R[L[j]])>>1);
				Gpal[p] = (byte)((G[L[i]] + G[L[j]])>>1);
				Bpal[p] = (byte)((B[L[i]] + B[L[j]])>>1);
				p++;
			}
		}
		return 16; // 4*4
	} else if(mode==2) {		// mixed
		for(int i=0; i<8; i++) {
			for(int j=0; j<4; j++) {
				for(int k=0; k<4; k++) {
					Rpal[p] = (byte)((R[L[j]] + R[L[k]] + (R[i]<<1))>>2);
					Gpal[p] = (byte)((G[L[j]] + G[L[k]] + (G[i]<<1))>>2);
					Bpal[p] = (byte)((B[L[j]] + B[L[k]] + (B[i]<<1))>>2);
					p++;
				}
			}
		}
		return 128; // 8*4*4
	} else if (mode==3) { // ql lores
		for(int i=0; i<8; i++) {
			Rpal[i] = (byte)R[i];
			Gpal[i] = (byte)G[i];
			Bpal[i] = (byte)B[i];
		}
		return 8;
	} else if (mode==4) { // ql hires
		for(int i=0; i<4; i++) {
			Rpal[i] = (byte)R[L[i]];
			Gpal[i] = (byte)G[L[i]];
			Bpal[i] = (byte)B[L[i]];
		}		
		return 4;
  	} else if (mode==5) { // bw
		if (forceblack) {
			Rpal[000]=(byte)0x00; Gpal[000]=(byte)0x00; Bpal[000]=(byte)0x00;
			Rpal[001]=(byte)rgbh; Gpal[001]=(byte)rgbh; Bpal[001]=(byte)rgbh;
		} else {
			Rpal[000]=(byte)rgbl; Gpal[000]=(byte)rgbl; Bpal[000]=(byte)rgbl;
			Rpal[001]=(byte)rgbh; Gpal[001]=(byte)rgbh; Bpal[001]=(byte)rgbh;
		}
		return 2;
	} else if (mode==6) { // bgw
		if (forceblack) {
			rgbi = rgbh-rgbl;
			Rpal[000]=(byte)0x00; Gpal[000]=(byte)0x00; Bpal[000]=(byte)0x00;
			rgbv = rgbl;
		} else {
			rgbi = (float)(rgbh-rgbl)/2;
			Rpal[000]=(byte)rgbl; Gpal[000]=(byte)rgbl; Bpal[000]=(byte)rgbl;
			rgbv = rgbl + rgbi;
		}
		Rpal[001]=(byte)rgbv; Gpal[001]=(byte)rgbv; Bpal[001]=(byte)rgbv; rgbv += rgbi;
		Rpal[002]=(byte)rgbv; Gpal[002]=(byte)rgbv; Bpal[002]=(byte)rgbv;
		return 3;
	} else if (mode==7) {
		OpenDialog od = new OpenDialog("Palette from indexed image", null);
		String file = od.getFileName();
		if (file == null)
			return 0;
		String directory = od.getDirectory();
		ImagePlus img = new Opener().openImage(directory+file);
		if (img==null) {
			IJ.error("failed to open image");
			return 0;
		}
		img.show();
		ColorModel cm = img.getProcessor().getColorModel();
		if (!(cm instanceof IndexColorModel)) {
			IJ.error("Not index color model");
			return 0;
		}
   		IndexColorModel icm = (IndexColorModel)cm;
   		int mapSize = icm.getMapSize();
   		icm.getReds(Rpal);
   		icm.getGreens(Gpal);
   		icm.getBlues(Bpal);
   		img.close();
   		return mapSize;
	} else if (mode==8) {
		ImagePlus img = NewImage.createImage("Lut", 256, 1, 1, 8,0);
		ImageProcessor ip = img.getProcessor();
		img.show();
		img = (ImagePlus)IJ.runPlugIn("ij.plugin.LutLoader", "");
		IndexColorModel icm = (IndexColorModel)ip.getColorModel();
		int mapSize = icm.getMapSize();
		icm.getReds(Rpal); 
		icm.getGreens(Gpal); 
		icm.getBlues(Bpal);
		img.close();			// uncommented
		//IJ.run("Close");		// commented
   		return mapSize;
	} else if (mode == 9) {
		for(int i=0; i<8; i++) {
			if (Cpal[i]) {
				p=i;
			}
			p = 0;
		}
		for(int i=0; i<8; i++) {
			if (Cpal[i]) {
				Rpal[i] = (byte)R[i];
				Gpal[i] = (byte)G[i];
				Bpal[i] = (byte)B[i];				
			} else {
				Rpal[i] = (byte)R[p];
				Gpal[i] = (byte)G[p];
				Bpal[i] = (byte)B[p];
			}
		}
		return 8;		
	}
	return 0;
  }
  
  public void iniError(int type) {
	  int x = 0;
	  int y = 0;
	  if (type==0) {				// floyd-steinberg
		  divisor = 16;
		  p[x++][y] = 0; p[x++][y]=0; p[x++][y] = 0; p[x++][y] = 7; p[x++][y] = 0; y++; x=0;
		  p[x++][y] = 0; p[x++][y]=3; p[x++][y] = 5; p[x++][y] = 1; p[x++][y] = 0; y++; x=0;
		  p[x++][y] = 0; p[x++][y]=0; p[x++][y] = 0; p[x++][y] = 0; p[x++][y] = 0;
	  } else if (type ==1) {		// jarvis-judice-nik
		  divisor = 48;
		  p[x++][y] = 0; p[x++][y]=0; p[x++][y] = 0; p[x++][y] = 7; p[x++][y] = 5; y++; x=0;
		  p[x++][y] = 3; p[x++][y]=4; p[x++][y] = 7; p[x++][y] = 5; p[x++][y] = 3; y++; x=0;
		  p[x++][y] = 1; p[x++][y]=3; p[x++][y] = 5; p[x++][y] = 3; p[x++][y] = 1;
	  } else if (type ==3) {		// stucki
		  divisor = 42;
		  p[x++][y] = 0; p[x++][y]=0; p[x++][y] = 0; p[x++][y] = 8; p[x++][y] = 4; y++; x=0;
		  p[x++][y] = 2; p[x++][y]=4; p[x++][y] = 8; p[x++][y] = 4; p[x++][y] = 2; y++; x=0;
		  p[x++][y] = 1; p[x++][y]=2; p[x++][y] = 4; p[x++][y] = 2; p[x++][y] = 1;
	  } else if (type ==4) {		// burkes
		  divisor = 32;
		  p[x++][y] = 0; p[x++][y]=0; p[x++][y] = 0; p[x++][y] = 8; p[x++][y] = 4; y++; x=0;
		  p[x++][y] = 2; p[x++][y]=4; p[x++][y] = 8; p[x++][y] = 4; p[x++][y] = 2; y++; x=0;
		  p[x++][y] = 0; p[x++][y]=0; p[x++][y] = 0; p[x++][y] = 0; p[x++][y] = 0;
	  } else if (type ==5) {		// sierra 3
		  divisor = 32;
		  p[x++][y] = 0; p[x++][y]=0; p[x++][y] = 0; p[x++][y] = 5; p[x++][y] = 3; y++; x=0;
		  p[x++][y] = 2; p[x++][y]=4; p[x++][y] = 5; p[x++][y] = 4; p[x++][y] = 2; y++; x=0;
		  p[x++][y] = 0; p[x++][y]=2; p[x++][y] = 3; p[x++][y] = 2; p[x++][y] = 0;	
	  } else if (type ==6) {		// sierra 2
		  divisor = 32;
		  p[x++][y] = 0; p[x++][y]=0; p[x++][y] = 0; p[x++][y] = 4; p[x++][y] = 3; y++; x=0;
		  p[x++][y] = 1; p[x++][y]=2; p[x++][y] = 3; p[x++][y] = 2; p[x++][y] = 1; y++; x=0;
		  p[x++][y] = 0; p[x++][y]=0; p[x++][y] = 0; p[x++][y] = 0; p[x++][y] = 0;	
	  } else if (type ==7) {		// sierra 1
		  divisor = 4;
		  p[x++][y] = 0; p[x++][y]=0; p[x++][y] = 0; p[x++][y] = 2; p[x++][y] = 0; y++; x=0;
		  p[x++][y] = 1; p[x++][y]=1; p[x++][y] = 1; p[x++][y] = 0; p[x++][y] = 0; y++; x=0;
		  p[x++][y] = 0; p[x++][y]=0; p[x++][y] = 0; p[x++][y] = 0; p[x++][y] = 0;
	  }
  }

  public void iniPattern(int type) {
	  int x = 0;
	  int y = 0;
	  if (type==0) {				// smooth 3 col pattern
		  pattLevels = 2;
		  pattX	 = 2;
		  pattY  = 2;
		  p[x++][y] = 1; p[x++][y]=2; y++; x=0;
		  p[x++][y] = 2; p[x++][y]=1;
	  } else if (type ==1) {		// bayer 2x2
		  pattLevels = 4;
		  pattX	 = 2;
		  pattY  = 2;
		  p[x++][y] = 1; p[x++][y]=3; y++; x=0;
		  p[x++][y] = 4; p[x++][y]=2;
	  } else if (type ==2) {		// ordered 3x3 (ugly)
		  pattLevels = 9;
		  pattX = 3;
		  pattY = 3;
		  p[x++][y] =  1; p[x++][y]= 7; p[x++][y]= 4; y++; x=0;
		  p[x++][y] =  5; p[x++][y]= 8; p[x++][y]= 3; y++; x=0;
		  p[x++][y] =  6; p[x++][y]= 2; p[x++][y]= 9; 
	  } else if (type ==3) {		// bayer 4x4
		  pattLevels = 16;
		  pattX	 = 4;
		  pattY  = 4;
		  p[x++][y] =  1; p[x++][y]= 9; p[x++][y]= 3; p[x++][y]=11; y++; x=0;
		  p[x++][y] = 13; p[x++][y]= 5; p[x++][y]=15; p[x++][y]= 7; y++; x=0;
		  p[x++][y] =  4; p[x++][y]=12; p[x++][y]= 2; p[x++][y]=10; y++; x=0;
		  p[x++][y] = 16; p[x++][y]= 8; p[x++][y]=14; p[x++][y]= 6;
	  } else if (type==4) {
		  pattLevels = 64;
		  pattX = 8;
		  pattY = 8;
		  p[x++][y]=1;	p[x++][y]=33;	p[x++][y]=9;	p[x++][y]=41;	p[x++][y]=3;	p[x++][y]=35;	p[x++][y]=11;	p[x++][y]=43;	y++; x=0;
		  p[x++][y]=49;	p[x++][y]=17;	p[x++][y]=57;	p[x++][y]=25;	p[x++][y]=51;	p[x++][y]=19;	p[x++][y]=59;	p[x++][y]=27;	y++; x=0;
		  p[x++][y]=13;	p[x++][y]=45;	p[x++][y]=5;	p[x++][y]=37;	p[x++][y]=15;	p[x++][y]=47;	p[x++][y]=7;	p[x++][y]=39;	y++; x=0;
		  p[x++][y]=61;	p[x++][y]=29;	p[x++][y]=53;	p[x++][y]=21;	p[x++][y]=63;	p[x++][y]=31;	p[x++][y]=55;	p[x++][y]=23;	y++; x=0;
		  p[x++][y]=4;	p[x++][y]=36;	p[x++][y]=12;	p[x++][y]=44;	p[x++][y]=2;	p[x++][y]=34;	p[x++][y]=10;	p[x++][y]=42;	y++; x=0;
		  p[x++][y]=52;	p[x++][y]=20;	p[x++][y]=60;	p[x++][y]=28;	p[x++][y]=50;	p[x++][y]=18;	p[x++][y]=58;	p[x++][y]=26;	y++; x=0;
		  p[x++][y]=16;	p[x++][y]=48;	p[x++][y]=8;	p[x++][y]=40;	p[x++][y]=14;	p[x++][y]=46;	p[x++][y]=6;	p[x++][y]=38;	y++; x=0;
		  p[x++][y]=64;	p[x++][y]=32;	p[x++][y]=56;	p[x++][y]=24;	p[x++][y]=62;	p[x++][y]=30;	p[x++][y]=54;	p[x++][y]=22;	
	  }
  }

/* W. Burger, M. J. Burge: "Digitale Bildverarbeitung" 
 * © Springer-Verlag, 2005
 * www.imagingbook.com
*/

/** Methods for converting between RGB and HSV color spaces.
*/

  	static float Diff(float val1, float val2) {
		if((val1-0.5)<0 & (val2+0.5)>1) {
			return Math.min(val1, val2)+1-Math.max(val1, val2);
		} else {
			return Math.abs(val1-val2);	
		}
  	}
  	
  
	static float[] RGBtoHSV (int R, int G, int B, float[] HSV) {
		// R,G,B in [0,255]
		float H = 0, S = 0, V = 0;
		float cMax = 255.0f;
		int cHi = Math.max(R,Math.max(G,B));	// highest color value
		int cLo = Math.min(R,Math.min(G,B));	// lowest color value
		int cRng = cHi - cLo;				    // color range
		
		// compute value V
		V = cHi / cMax;
		
		// compute saturation S
		if (cHi > 0)
			S = (float) cRng / cHi;

		// compute hue H
		if (cRng > 0) {	// hue is defined only for color pixels
			float rr = (float)(cHi - R) / cRng;
			float gg = (float)(cHi - G) / cRng;
			float bb = (float)(cHi - B) / cRng;
			float hh;
			if (R == cHi)                      // r is highest color value
				hh = bb - gg;
			else if (G == cHi)                 // g is highest color value
				hh = rr - bb + 2.0f;
			else                               // b is highest color value
				hh = gg - rr + 4.0f;
			if (hh < 0)
				hh= hh + 6;
			H = hh / 6;
		}
		
		if (HSV == null)	// create a new HSV array if needed
			HSV = new float[3];
		HSV[0] = H; HSV[1] = S; HSV[2] = V;
		return HSV;
	}
	
	static int HSVtoRGB (float h, float s, float v) {
		// h,s,v in [0,1]
		float rr = 0, gg = 0, bb = 0;
		float hh = (6 * h) % 6;                 
		int   c1 = (int) hh;                     
		float c2 = hh - c1;
		float x = (1 - s) * v;
		float y = (1 - (s * c2)) * v;
		float z = (1 - (s * (1 - c2))) * v;	
		switch (c1) {
			case 0: rr=v; gg=z; bb=x; break;
			case 1: rr=y; gg=v; bb=x; break;
			case 2: rr=x; gg=v; bb=z; break;
			case 3: rr=x; gg=y; bb=v; break;
			case 4: rr=z; gg=x; bb=v; break;
			case 5: rr=v; gg=x; bb=y; break;
		}
		int N = 256;
		int r = Math.min(Math.round(rr*N),N-1);
		int g = Math.min(Math.round(gg*N),N-1);
		int b = Math.min(Math.round(bb*N),N-1);
		// create int-packed RGB-color:
		int rgb = ((r&0xff)<<16) | ((g&0xff)<<8) | b&0xff; 
		return rgb;
	}
}
