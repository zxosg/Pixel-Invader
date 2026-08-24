import ij.IJ;
import ij.ImagePlus;
import ij.WindowManager;
import ij.gui.GenericDialog;
import ij.gui.NewImage;
import ij.plugin.filter.PlugInFilter;
import ij.process.ImageProcessor;

import java.awt.image.IndexColorModel;
import java.util.Random;

public class OsgDither_Optimized implements PlugInFilter {

    private static final int MAX_COLOR_VALUE = 255;
    private static boolean forceBlack = true;
    private static boolean preview = true;
    private static boolean randomize = false;
    private static boolean keepPalette = false;
    private static double gammaValue = 100.0;
    private static int ditherLevel = 64;
    private static int randomizerLevel = 3;
    private static byte[] redPalette = new byte[256];
    private static byte[] greenPalette = new byte[256];
    private static byte[] bluePalette = new byte[256];
    private static int[] gammaTable = new int[256];

    public int setup(String arg, ImagePlus imp) {
        if (arg.equals("about")) {
            showAbout();
            return DONE;
        }
        return DOES_ALL;
    }

    public void run(ImageProcessor ip) {
        ImagePlus imp = WindowManager.getCurrentImage();
        if (imp == null) {
            IJ.error("No image is open.");
            return;
        }

        if (imp.getType() != ImagePlus.COLOR_RGB) {
            ip = ip.convertToRGB();
        }

        while (preview) {
            if (!showDialog()) return;

            makeGammaTable(gammaValue, gammaTable);
            int paletteSize = initializePalette();
            if (paletteSize == 0) {
                IJ.error("Palette initialization failed.");
                return;
            }

            applyDithering(ip, paletteSize);
            IJ.run("Cascade");
        }
    }

    private boolean showDialog() {
        GenericDialog gd = new GenericDialog("Dithering Options", IJ.getInstance());
        gd.addSlider("Dither Level:", 0, 100, ditherLevel);
        gd.addSlider("Randomizer Level:", 0, 255, randomizerLevel);
        gd.addSlider("Gamma (100 = 1.0):", 0, 400, gammaValue);
        gd.addCheckbox("Force Black", forceBlack);
        gd.addCheckbox("Randomize", randomize);
        gd.addCheckbox("Keep Palette", keepPalette);
        gd.addCheckbox("Preview", preview);
        gd.showDialog();

        if (gd.wasCanceled()) return false;

        ditherLevel = (int) gd.getNextNumber();
        randomizerLevel = (int) gd.getNextNumber();
        gammaValue = gd.getNextNumber();
        forceBlack = gd.getNextBoolean();
        randomize = gd.getNextBoolean();
        keepPalette = gd.getNextBoolean();
        preview = gd.getNextBoolean();

        return true;
    }

    private void makeGammaTable(double gamma, int[] table) {
        double normalizedGamma = gamma / 100.0;
        double maxVal = Math.pow(MAX_COLOR_VALUE, 1.0 / normalizedGamma);
        for (int i = 0; i < 256; i++) {
            table[i] = (int) (Math.pow(i, 1.0 / normalizedGamma) / maxVal * 256);
        }
    }

    private int initializePalette() {
        int index = 0;
        int step = MAX_COLOR_VALUE / 7;

        for (int i = 0; i <= MAX_COLOR_VALUE; i += step) {
            redPalette[index] = (byte) i;
            greenPalette[index] = (byte) i;
            bluePalette[index] = (byte) i;
            index++;
        }

        if (forceBlack) {
            redPalette[0] = 0;
            greenPalette[0] = 0;
            bluePalette[0] = 0;
        }

        return index;
    }

    private void applyDithering(ImageProcessor ip, int paletteSize) {
        int width = ip.getWidth();
        int height = ip.getHeight();
        int[] pixels = (int[]) ip.getPixels();

        ImagePlus ditheredImage = NewImage.createImage("Dithered Image", width, height, 1, 8, 0);
        IndexColorModel colorModel = new IndexColorModel(8, paletteSize, redPalette, greenPalette, bluePalette);
        ImageProcessor ditheredProcessor = ditheredImage.getProcessor();
        ditheredProcessor.setColorModel(colorModel);
        byte[] ditheredPixels = (byte[]) ditheredProcessor.getPixels();

        Random random = new Random();
        for (int y = 0; y < height; y++) {
            for (int x = 0; x < width; x++) {
                int index = y * width + x;
                int rgb = pixels[index];
                int r = gammaTable[(rgb >> 16) & 0xFF];
                int g = gammaTable[(rgb >> 8) & 0xFF];
                int b = gammaTable[rgb & 0xFF];

                int bestMatch = findBestMatch(r, g, b, paletteSize);
                ditheredPixels[index] = (byte) bestMatch;

                if (randomize) {
                    r += random.nextInt(randomizerLevel) - (randomizerLevel / 2);
                    g += random.nextInt(randomizerLevel) - (randomizerLevel / 2);
                    b += random.nextInt(randomizerLevel) - (randomizerLevel / 2);
                }
            }
            IJ.showProgress(y, height);
        }

        ditheredImage.show();
        ditheredImage.updateAndDraw();
    }

    private int findBestMatch(int r, int g, int b, int paletteSize) {
        int bestMatch = 0;
        int minDistance = Integer.MAX_VALUE;

        for (int i = 0; i < paletteSize; i++) {
            int dr = r - (redPalette[i] & 0xFF);
            int dg = g - (greenPalette[i] & 0xFF);
            int db = b - (bluePalette[i] & 0xFF);
            int distance = dr * dr + dg * dg + db * db;

            if (distance < minDistance) {
                minDistance = distance;
                bestMatch = i;
            }
        }

        return bestMatch;
    }

    private void showAbout() {
        IJ.showMessage("About Dithering Plugin", "Optimized dithering plugin for ImageJ\nVersion 2.0");
    }
}
