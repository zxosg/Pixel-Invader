import ij.ImagePlus;
import ij.plugin.filter.PlugInFilter;
import ij.process.ImageProcessor;
import ij.gui.GenericDialog;
import java.awt.Color;

public class DitherVIDE_Dual implements PlugInFilter {
    private ImagePlus imp;
    private int blockSize = 8;
    private float brightness = 0.66f;
    private Color[] zxPalette;
    private Color[][] blockColors;

    public int setup(String arg, ImagePlus imp) {
        this.imp = imp;
        initZXPalette();
        showDialog();
        return DOES_RGB;
    }

    private void showDialog() {
        GenericDialog gd = new GenericDialog("ZX Spectrum Dither");
        gd.addSlider("Brightness (%)", 0, 100, brightness * 100);
        gd.showDialog();
        if (!gd.wasCanceled()) {
            brightness = (float) gd.getNextNumber() / 100;
        }
    }

    private void initZXPalette() {
        // ZX Spectrum 15-color palette (8 normal + 7 bright)
        zxPalette = new Color[15];
        // Normal colors
        zxPalette[0] = new Color(0x000000);
        zxPalette[1] = new Color(0x0000FF);
        zxPalette[2] = new Color(0xFF0000);
        zxPalette[3] = new Color(0xFF00FF);
        zxPalette[4] = new Color(0x00FF00);
        zxPalette[5] = new Color(0x00FFFF);
        zxPalette[6] = new Color(0xFFFF00);
        zxPalette[7] = new Color(0xFFFFFF);
        // Bright colors (66% brighter)
        for (int i = 8; i < 15; i++) {
            Color base = zxPalette[i - 8];
            zxPalette[i] = new Color(
                Math.min(base.getRed() + (int) ((255 - base.getRed()) * brightness), 255),
                Math.min(base.getGreen() + (int) ((255 - base.getGreen()) * brightness), 255),
                Math.min(base.getBlue() + (int) ((255 - base.getBlue()) * brightness), 255)
            );
        }
    }

    public void run(ImageProcessor ip) {
        int w = ip.getWidth();
        int h = ip.getHeight();
        calculateBlockColors(ip);
        float[][][] error = new float[h][w][3];

        for (int by = 0; by < h; by += blockSize) {
            for (int bx = 0; bx < w; bx += blockSize) {
                processBlock(ip, error, bx, by,
                    Math.min(bx + blockSize, w),
                    Math.min(by + blockSize, h));
            }
        }
        imp.updateAndDraw();
    }

    private void calculateBlockColors(ImageProcessor ip) {
        int xBlocks = (ip.getWidth() + blockSize - 1) / blockSize;
        int yBlocks = (ip.getHeight() + blockSize - 1) / blockSize;
        blockColors = new Color[xBlocks * yBlocks][2];

        for (int by = 0; by < ip.getHeight(); by += blockSize) {
            for (int bx = 0; bx < ip.getWidth(); bx += blockSize) {
                int blockIdx = (by / blockSize) * xBlocks + (bx / blockSize);
                blockColors[blockIdx] = quantizeBlock(ip, bx, by);
            }
        }
    }

    private Color[] quantizeBlock(ImageProcessor ip, int x, int y) {
        // Simplified quantization - implement proper method here
        return new Color[]{zxPalette[0], zxPalette[7]};
    }

    private void processBlock(ImageProcessor ip, float[][][] error,
                             int x1, int y1, int x2, int y2) {
        int blockIdx = (y1 / blockSize) * ((ip.getWidth() + blockSize - 1) / blockSize) + (x1 / blockSize);
        Color[] colors = blockColors[blockIdx];

        for (int y = y1; y < y2; y++) {
            boolean forward = (y % 2) == 0;
            int xStart = forward ? x1 : x2 - 1;
            int xEnd = forward ? x2 : x1 - 1;
            int xStep = forward ? 1 : -1;

            for (int x = xStart; forward ? x < xEnd : x > xEnd; x += xStep) {
                Color original = new Color(ip.getPixel(x, y));
                float[] err = error[y][x];

                // Fixed type conversions with explicit casting
                int r = clamp((int) (original.getRed() + err[0]));
                int g = clamp((int) (original.getGreen() + err[1]));
                int b = clamp((int) (original.getBlue() + err[2]));

                Color chosen = findClosestColor(new Color(r, g, b), colors);
                ip.putPixel(x, y, chosen.getRGB());

                float er = r - chosen.getRed();
                float eg = g - chosen.getGreen();
                float eb = b - chosen.getBlue();

                distributeError(error, x, y, xStep, er, eg, eb, x1, x2, y1, y2);
            }
        }
    }

    private Color findClosestColor(Color target, Color[] palette) {
        float minDist = Float.MAX_VALUE;
        Color best = palette[0];
        for (Color c : palette) {
            float dist = colorDistance(target, c);
            if (dist < minDist) {
                minDist = dist;
                best = c;
            }
        }
        return best;
    }

    private float colorDistance(Color c1, Color c2) {
        float y1 = 0.299f * c1.getRed() + 0.587f * c1.getGreen() + 0.114f * c1.getBlue();
        float y2 = 0.299f * c2.getRed() + 0.587f * c2.getGreen() + 0.114f * c2.getBlue();
        float i1 = 0.5959f * c1.getRed() - 0.2746f * c1.getGreen() - 0.3213f * c1.getBlue();
        float i2 = 0.5959f * c2.getRed() - 0.2746f * c2.getGreen() - 0.3213f * c2.getBlue();
        float q1 = 0.2115f * c1.getRed() - 0.5227f * c1.getGreen() + 0.3112f * c1.getBlue();
        float q2 = 0.2115f * c2.getRed() - 0.5227f * c2.getGreen() + 0.3112f * c2.getBlue();
        return (float) Math.sqrt(
            Math.pow(y1 - y2, 2) +
            Math.pow(i1 - i2, 2) +
            Math.pow(q1 - q2, 2)
        );
    }

    private void distributeError(float[][][] error, int x, int y, int xStep,
                                float er, float eg, float eb,
                                int x1, int x2, int y1, int y2) {
        if (x + xStep >= x1 && x + xStep < x2) {
            addError(error, x + xStep, y, er * 7 / 16, eg * 7 / 16, eb * 7 / 16);
        }
        if (y + 1 < y2) {
            if (x - xStep >= x1) {
                addError(error, x - xStep, y + 1, er * 3 / 16, eg * 3 / 16, eb * 3 / 16);
            }
            addError(error, x, y + 1, er * 5 / 16, eg * 5 / 16, eb * 5 / 16);
            if (x + xStep < x2) {
                addError(error, x + xStep, y + 1, er * 1 / 16, eg * 1 / 16, eb * 1 / 16);
            }
        }
    }

    private void addError(float[][][] error, int x, int y, float er, float eg, float eb) {
        if (x >= 0 && x < error[0].length && y >= 0 && y < error.length) {
            error[y][x][0] += er;
            error[y][x][1] += eg;
            error[y][x][2] += eb;
        }
    }

    private int clamp(int value) {
        return Math.max(0, Math.min(255, value));
    }
}
