import ij.ImagePlus;
import ij.plugin.filter.PlugInFilter;
import ij.process.ImageProcessor;
import ij.gui.GenericDialog;
import java.awt.Color;

public class DitherVIDE_Dual implements PlugInFilter {
    private ImagePlus imp;
    private int blockSize = 8;
    private Color[][] blockPalettes;
    private double gamma = 2.2;
    private boolean vicPalette = false;

    public int setup(String arg, ImagePlus imp) {
        this.imp = imp;
        showDialog();
        return DOES_RGB;
    }

    private void showDialog() {
        GenericDialog gd = new GenericDialog("DitherVIDE Dual-Screen");
        gd.addNumericField("Block Size", blockSize, 0);
        gd.addCheckbox("VIC-II Palette", false);
        gd.addNumericField("Gamma", gamma, 2);
        gd.showDialog();
        
        if (gd.wasCanceled()) return;
        
        blockSize = (int) gd.getNextNumber();
        vicPalette = gd.getNextBoolean();
        gamma = gd.getNextNumber();
    }

    public void run(ImageProcessor ip) {
        int w = ip.getWidth();
        int h = ip.getHeight();
        
        // Initialize block palettes
        initBlockPalettes(ip, w, h);
        
        // Create working copy with error diffusion
        float[][][] errorBuffer = new float[h][w][3];
        
        // Process in block-sized increments
        for (int by = 0; by < h; by += blockSize) {
            for (int bx = 0; bx < w; bx += blockSize) {
                processBlock(ip, errorBuffer, bx, by, 
                    Math.min(bx + blockSize, w), 
                    Math.min(by + blockSize, h));
            }
        }
        
        imp.updateAndDraw();
    }

    private void initBlockPalettes(ImageProcessor ip, int w, int h) {
        int xBlocks = (w + blockSize - 1) / blockSize;
        int yBlocks = (h + blockSize - 1) / blockSize;
        blockPalettes = new Color[xBlocks * yBlocks][2];
        
        // Analyze each block to find best two colors
        for (int by = 0; by < h; by += blockSize) {
            for (int bx = 0; bx < w; bx += blockSize) {
                Color[] colors = findBlockColors(ip, bx, by,
                    Math.min(bx + blockSize, w),
                    Math.min(by + blockSize, h));
                
                int blockIdx = (by/blockSize)*xBlocks + (bx/blockSize);
                blockPalettes[blockIdx] = colors;
            }
        }
    }

    private Color[] findBlockColors(ImageProcessor ip, int x1, int y1, int x2, int y2) {
        // Implement color quantization for block (original C code's cmpatr logic)
        // Returns best two colors for the block
        Color[] defaultColors = {Color.BLACK, Color.WHITE};
        return defaultColors; // Simplified - implement actual color matching
    }

    private void processBlock(ImageProcessor ip, float[][][] errorBuffer,
                             int x1, int y1, int x2, int y2) {
        int blockIdx = (y1/blockSize)*((ip.getWidth()+blockSize-1)/blockSize) + (x1/blockSize);
        Color[] palette = blockPalettes[blockIdx];
        
        for (int y = y1; y < y2; y++) {
            boolean forward = (y % 2) == 0; // Dual-screen zig-zag pattern
            int xStart = forward ? x1 : x2 - 1;
            int xEnd = forward ? x2 : x1 - 1;
            int xStep = forward ? 1 : -1;

            for (int x = xStart; forward ? (x < xEnd) : (x > xEnd); x += xStep) {
                Color original = applyGamma(new Color(ip.getPixel(x, y)), gamma);
                float[] error = errorBuffer[y][x];
                
                // Add accumulated error
                float r = clamp(original.getRed()/255f + error[0]);
                float g = clamp(original.getGreen()/255f + error[1]);
                float b = clamp(original.getBlue()/255f + error[2]);
                
                // Find nearest color in block palette
                Color nearest = findClosestColor(new Color((int)(r*255), 
                    (int)(g*255), (int)(b*255)), palette);
                
                // Set pixel
                ip.putPixel(x, y, nearest.getRGB());
                
                // Calculate quantization error
                float er = r - (nearest.getRed()/255f);
                float eg = g - (nearest.getGreen()/255f);
                float eb = b - (nearest.getBlue()/255f);
                
                // Distribute error using Floyd-Steinberg weights
                distributeError(errorBuffer, x, y, xStep, er, eg, eb, x1, x2, y1, y2);
            }
        }
    }

    private Color applyGamma(Color c, double gamma) {
        double[] lut = new double[256];
        for (int i = 0; i < 256; i++) 
            lut[i] = Math.pow(i/255.0, gamma);
        return new Color(
            (int)(255 * lut[c.getRed()]),
            (int)(255 * lut[c.getGreen()]),
            (int)(255 * lut[c.getBlue()])
        );
    }

    private void distributeError(float[][][] buffer, int x, int y, int xStep,
                                float er, float eg, float eb,
                                int x1, int x2, int y1, int y2) {
        // Within block bounds only
        if (x + xStep >= x1 && x + xStep < x2) {
            addError(buffer, x+xStep, y  , er*7/16, eg*7/16, eb*7/16);
        }
        if (y + 1 < y2) {
            if (x - xStep >= x1 && x - xStep < x2) {
                addError(buffer, x-xStep, y+1, er*3/16, eg*3/16, eb*3/16);
            }
            addError(buffer, x    , y+1, er*5/16, eg*5/16, eb*5/16);
            if (x + xStep >= x1 && x + xStep < x2) {
                addError(buffer, x+xStep, y+1, er*1/16, eg*1/16, eb*1/16);
            }
        }
    }

    private void addError(float[][][] buffer, int x, int y, float er, float eg, float eb) {
        if (x >= 0 && x < buffer[0].length && y >= 0 && y < buffer.length) {
            buffer[y][x][0] += er;
            buffer[y][x][1] += eg;
            buffer[y][x][2] += eb;
        }
    }

    private Color findClosestColor(Color target, Color[] palette) {
        int minDist = Integer.MAX_VALUE;
        Color best = palette[0];
        for (Color c : palette) {
            int dist = colorDistance(target, c);
            if (dist < minDist) {
                minDist = dist;
                best = c;
            }
        }
        return best;
    }

    private int colorDistance(Color c1, Color c2) {
        // Perceptual color distance approximation
        int dr = c1.getRed() - c2.getRed();
        int dg = c1.getGreen() - c2.getGreen();
        int db = c1.getBlue() - c2.getBlue();
        return (dr*dr*299 + dg*dg*587 + db*db*114)/1000;
    }

    private float clamp(float value) {
        return Math.max(0, Math.min(1, value));
    }
}
