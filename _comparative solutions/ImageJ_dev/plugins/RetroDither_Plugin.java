import ij.*; // Import ImageJ core classes
import ij.process.*; // Import ImageProcessor for pixel manipulation
import ij.gui.*; // Import GUI classes like GenericDialog, Roi
import ij.plugin.filter.PlugInFilter; // Import PlugInFilter interface

import java.awt.Color; // Import standard Java Color class
import java.util.HashMap; // For counting colors
import java.util.Map; // For counting colors
import java.util.List; // For sorting colors
import java.util.ArrayList; // For sorting colors
import java.util.Collections; // For sorting colors
import java.util.Comparator; // For sorting colors


public class RetroDither_Plugin implements PlugInFilter {

    // Helper class to store the two main colors for an attribute block
    private static class AttributeData {
        Color color1;
        Color color2;
        Color[] pair = new Color[2]; // Store as a mini-palette

        AttributeData(Color c1, Color c2) {
            // Simple assignment for now. Could enforce order (e.g., dark/light) later.
            this.color1 = c1;
            this.color2 = c2;
            this.pair[0] = c1;
            this.pair[1] = c2;
        }

        // Default if only one color found
         AttributeData(Color c1) {
            this.color1 = c1;
            this.color2 = c1; // Use same color if only one
            this.pair[0] = c1;
            this.pair[1] = c1;
        }

        Color[] getPair() {
            return pair;
        }
    }

    private ImagePlus inputImage;
    private String targetMachine = "ZX Spectrum";
    private String ditherMethod = "Floyd-Steinberg"; // Default dither method
    private final String[] DITHER_OPTIONS = {"None (Nearest Color)", "Floyd-Steinberg"};
    private final int BLOCK_WIDTH = 8; // Standard attribute block size [cite: 1]
    private final int BLOCK_HEIGHT = 8; // Standard attribute block size [cite: 1]

    // Palettes defined as before...
    private static final Color[] ZX_PALETTE_NORMAL = { /* ... palette data ... */
        new Color(0x00, 0x00, 0x00), new Color(0x00, 0x00, 0xff), new Color(0xff, 0x00, 0x00),
        new Color(0xff, 0x00, 0xff), new Color(0x00, 0xff, 0x00), new Color(0x00, 0xff, 0xff),
        new Color(0xff, 0xff, 0x00), new Color(0xff, 0xff, 0xff)
    };
    private static final Color[] C64_PALETTE_DEFAULT = { /* ... palette data ... */
        new Color(0x00, 0x00, 0x00), new Color(0xff, 0xff, 0xff), new Color(0x68, 0x37, 0x2b),
        new Color(0x70, 0xa4, 0xb2), new Color(0x6f, 0x3d, 0x86), new Color(0x58, 0x8d, 0x43),
        new Color(0x35, 0x28, 0x79), new Color(0xb8, 0xc7, 0x6f), new Color(0x6f, 0x4f, 0x25),
        new Color(0x43, 0x39, 0x00), new Color(0x9a, 0x67, 0x59), new Color(0x44, 0x44, 0x44),
        new Color(0x6c, 0x6c, 0x6c), new Color(0x9a, 0xd2, 0x84), new Color(0x6c, 0x5e, 0xb5),
        new Color(0x95, 0x95, 0x95)
    };


    @Override
    public int setup(String arg, ImagePlus imp) {
        if (imp == null) {
            IJ.noImage();
            return DONE;
        }
        this.inputImage = imp;
        return DOES_RGB;
    }

    @Override
    public void run(ImageProcessor ip) {
        if (!showDialog()) {
            return;
        }

        Color[] selectedPalette = getSelectedPalette();
        if (selectedPalette == null) {
            IJ.error("Invalid machine selection.");
            return;
        }

        ImageProcessor outputIp = ip.duplicate();

        if (ditherMethod.equals(DITHER_OPTIONS[0])) {
             IJ.showStatus("Mapping to nearest color...");
             mapToNearestColor(outputIp, selectedPalette);
             IJ.showStatus("");
        } else if (ditherMethod.equals(DITHER_OPTIONS[1])) {
             IJ.showStatus("Applying Floyd-Steinberg dithering with attributes...");
             applyFloydSteinbergDithering(outputIp, selectedPalette); // Now includes attribute calculation
             IJ.showStatus("");
        } else {
            IJ.error("Unknown dithering method selected.");
            return;
        }

        ImagePlus outputImage = new ImagePlus("Processed_" + inputImage.getTitle(), outputIp);
        outputImage.show();
    }

    // showDialog, getSelectedPalette remain the same as before...
    private boolean showDialog() {
        GenericDialog gd = new GenericDialog("Retro Dither Options");
        gd.addChoice("Target Machine:", new String[]{"ZX Spectrum", "Commodore 64"}, targetMachine);
        gd.addChoice("Dithering:", DITHER_OPTIONS, ditherMethod);

        gd.showDialog();
        if (gd.wasCanceled()) {
            return false;
        }

        targetMachine = gd.getNextChoice();
        ditherMethod = gd.getNextChoice();

        return true;
    }

     private Color[] getSelectedPalette() {
         if (targetMachine.equals("ZX Spectrum")) {
             return ZX_PALETTE_NORMAL;
         } else if (targetMachine.equals("Commodore 64")) {
             return C64_PALETTE_DEFAULT;
         }
         return null;
     }

    /**
     * Simple processing: Replace each pixel with the nearest color from the *full* palette.
     */
    private void mapToNearestColor(ImageProcessor ip, Color[] palette) {
        int width = ip.getWidth();
        int height = ip.getHeight();
        int[] rgb = new int[3];

        for (int y = 0; y < height; y++) {
            IJ.showProgress(y, height);
            for (int x = 0; x < width; x++) {
                ip.getPixel(x, y, rgb);
                Color originalColor = new Color(rgb[0], rgb[1], rgb[2]);
                Color nearestColor = findNearestColor(originalColor, palette); // Use full palette
                ip.setColor(nearestColor);
                ip.drawPixel(x, y);
            }
        }
    }


    /**
     * Calculates the dominant color pair for each attribute block.
     * Current strategy: Find the two most frequent nearest palette colors in the block.
     * Returns a 2D array of AttributeData.
     */
     private AttributeData[][] calculateBlockAttributes(ImageProcessor ip, Color[] fullPalette) {
         int width = ip.getWidth();
         int height = ip.getHeight();
         int blocksWide = (width + BLOCK_WIDTH - 1) / BLOCK_WIDTH;
         int blocksHigh = (height + BLOCK_HEIGHT - 1) / BLOCK_HEIGHT;

         AttributeData[][] attributes = new AttributeData[blocksHigh][blocksWide];
         int[] pixelRgb = new int[3];

         IJ.showStatus("Calculating attributes...");
         for (int by = 0; by < blocksHigh; by++) {
             IJ.showProgress(by, blocksHigh);
             for (int bx = 0; bx < blocksWide; bx++) {
                 // Use a map to count occurrences of nearest palette colors within the block
                 Map<Color, Integer> colorCounts = new HashMap<>();

                 int startX = bx * BLOCK_WIDTH;
                 int startY = by * BLOCK_HEIGHT;
                 int endX = Math.min(startX + BLOCK_WIDTH, width);
                 int endY = Math.min(startY + BLOCK_HEIGHT, height);

                 for (int y = startY; y < endY; y++) {
                     for (int x = startX; x < endX; x++) {
                         ip.getPixel(x, y, pixelRgb);
                         Color originalColor = new Color(pixelRgb[0], pixelRgb[1], pixelRgb[2]);
                         Color nearestPalColor = findNearestColor(originalColor, fullPalette);
                         colorCounts.put(nearestPalColor, colorCounts.getOrDefault(nearestPalColor, 0) + 1);
                     }
                 }

                 // Find the top two colors based on counts
                 List<Map.Entry<Color, Integer>> sortedCounts = new ArrayList<>(colorCounts.entrySet());
                 // Sort descending by count
                 sortedCounts.sort(Map.Entry.comparingByValue(Comparator.reverseOrder()));

                 Color c1, c2;
                 if (sortedCounts.size() >= 2) {
                     c1 = sortedCounts.get(0).getKey();
                     c2 = sortedCounts.get(1).getKey();
                 } else if (sortedCounts.size() == 1) {
                     c1 = sortedCounts.get(0).getKey();
                     c2 = c1; // Only one color found, use it for both
                 } else {
                     // No pixels / empty block? Default to first two palette colors
                     c1 = fullPalette[0];
                     c2 = (fullPalette.length > 1) ? fullPalette[1] : fullPalette[0];
                 }
                 attributes[by][bx] = new AttributeData(c1, c2);
             }
         }
         return attributes;
     }


     /**
     * Applies Floyd-Steinberg dithering, using pre-calculated block attributes.
     * Modifies the input ImageProcessor directly.
     */
    private void applyFloydSteinbergDithering(ImageProcessor ip, Color[] fullPalette) {
        int width = ip.getWidth();
        int height = ip.getHeight();

        // 1. Calculate attributes for all blocks first
        AttributeData[][] blockAttributes = calculateBlockAttributes(ip, fullPalette);

        // Create float arrays to store the error for each channel
        float[][] errorR = new float[height][width];
        float[][] errorG = new float[height][width];
        float[][] errorB = new float[height][width];

        int[] currentPixelRGB = new int[3];

        IJ.showStatus("Applying Floyd-Steinberg dithering...");
        for (int y = 0; y < height; y++) {
             IJ.showProgress(y, height);
            for (int x = 0; x < width; x++) {

                // Get original pixel color
                ip.getPixel(x, y, currentPixelRGB);

                // Add the accumulated error from previous distributions
                float oldR = clamp(currentPixelRGB[0] + errorR[y][x]);
                float oldG = clamp(currentPixelRGB[1] + errorG[y][x]);
                float oldB = clamp(currentPixelRGB[2] + errorB[y][x]);

                // *** Get the attribute data for the current block ***
                int blockX = x / BLOCK_WIDTH;
                int blockY = y / BLOCK_HEIGHT;
                AttributeData attr = blockAttributes[blockY][blockX];
                Color[] blockPalette = attr.getPair(); // The 2 colors allowed for this block

                // Find the nearest color *within the block's 2-color palette*
                Color targetColor = new Color((int)oldR, (int)oldG, (int)oldB);
                Color nearestColor = findNearestColor(targetColor, blockPalette); // Use block's pair

                // Set the output pixel to the chosen block palette color
                ip.setColor(nearestColor);
                ip.drawPixel(x, y);

                // Calculate the quantization error
                float quantErrorR = oldR - nearestColor.getRed();
                float quantErrorG = oldG - nearestColor.getGreen();
                float quantErrorB = oldB - nearestColor.getBlue();

                // Distribute the error (same logic as before)
                if (x + 1 < width) {
                    errorR[y][x + 1] += quantErrorR * 7.0f / 16.0f; errorG[y][x + 1] += quantErrorG * 7.0f / 16.0f; errorB[y][x + 1] += quantErrorB * 7.0f / 16.0f;
                }
                if (x - 1 >= 0 && y + 1 < height) {
                    errorR[y + 1][x - 1] += quantErrorR * 3.0f / 16.0f; errorG[y + 1][x - 1] += quantErrorG * 3.0f / 16.0f; errorB[y + 1][x - 1] += quantErrorB * 3.0f / 16.0f;
                }
                if (y + 1 < height) {
                    errorR[y + 1][x] += quantErrorR * 5.0f / 16.0f; errorG[y + 1][x] += quantErrorG * 5.0f / 16.0f; errorB[y + 1][x] += quantErrorB * 5.0f / 16.0f;
                }
                if (x + 1 < width && y + 1 < height) {
                    errorR[y + 1][x + 1] += quantErrorR * 1.0f / 16.0f; errorG[y + 1][x + 1] += quantErrorG * 1.0f / 16.0f; errorB[y + 1][x + 1] += quantErrorB * 1.0f / 16.0f;
                }
            }
        }
    }

    // findNearestColor, clamp methods remain the same as before...
     private Color findNearestColor(Color targetColor, Color[] palette) {
        Color nearest = null;
        double minDistanceSq = Double.MAX_VALUE;

        // Handle case where palette might be null or empty unexpectedly
        if (palette == null || palette.length == 0) {
             // Return black or throw an error, depending on desired behavior
             return Color.BLACK;
        }


        for (Color paletteColor : palette) {
            if (paletteColor == null) continue; // Skip if somehow a null color got into palette
            double dr = targetColor.getRed() - paletteColor.getRed();
            double dg = targetColor.getGreen() - paletteColor.getGreen();
            double db = targetColor.getBlue() - paletteColor.getBlue();
             double distanceSq = dr * dr + dg * dg + db * db;

            if (distanceSq < minDistanceSq) {
                minDistanceSq = distanceSq;
                nearest = paletteColor;
            }
        }
        // Ensure we always return a color
        return (nearest != null) ? nearest : palette[0];
    }

    private float clamp(float value) {
        if (value < 0) return 0;
        if (value > 255) return 255;
        return value;
    }

    // --- Methods to be added later ---
    // - saveTapFile(...)
    // - saveVicFile(...)
    // - gammaCorrect(...)
    // - Implement other dither methods (ordered dither)
    // - Implement more sophisticated attribute calculation from C code
}
