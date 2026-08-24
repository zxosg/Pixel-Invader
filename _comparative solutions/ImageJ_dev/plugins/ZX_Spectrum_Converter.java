import ij.*;
import ij.process.*;
import ij.gui.*;
import ij.plugin.filter.PlugInFilter;
import java.awt.*;
import java.awt.event.*;
import java.io.*;
import java.util.*; // Required for Vector, List, Map, HashMap, Comparator, ArrayList, Arrays
import javax.swing.*;
import javax.swing.filechooser.FileNameExtensionFilter;
import java.awt.image.BufferedImage;
import java.awt.image.RescaleOp;
import java.awt.image.LookupTable;
import java.awt.image.LookupOp;
import java.awt.image.ShortLookupTable;
import java.awt.image.DataBufferInt;

/**
 * ImageJ plugin to convert images to a ZX Spectrum-like appearance
 * with real-time preview capabilities, simplified UI, color modes,
 * and corrected Bright attribute handling and block size logic.
 * Version: 2025-04-06-Fix3
 */
public class ZX_Spectrum_Converter implements PlugInFilter, ActionListener, ItemListener {

    // --- Enums for Modes ---
    private enum DitheringMode { // Unchanged
        FLOYD_STEINBERG("Floyd-Steinberg"), HALFTONE("Halftone"), BAYER_2X2("Bayer 2x2"),
        BAYER_4X4("Bayer 4x4"), BAYER_8X8("Bayer 8x8");
        private final String label; DitheringMode(String label) { this.label = label; }
        @Override public String toString() { return label; }
        public static String[] getLabels() { return Arrays.stream(DitheringMode.values()).map(DitheringMode::toString).toArray(String[]::new); }
        public static DitheringMode fromString(String text) { for (DitheringMode b : DitheringMode.values()) { if (b.label.equalsIgnoreCase(text)) { return b; } } return FLOYD_STEINBERG; }
        public int getBayerSize() { switch (this) { case BAYER_2X2: return 2; case BAYER_4X4: return 4; case BAYER_8X8: return 8; default: return 0; } }
    }

    private enum ColorMode {
        ZX_NORMAL("ZX Spectrum (Normal)"),
        ZX_BRIGHT_ATTRIBUTE("ZX Spectrum (Bright Attribute)"), // Renamed
        BLACK_AND_WHITE("Black and White"),
        BLACK_RED_GREEN_WHITE("Black/Red/Green/White"),
        CUSTOM("Custom (External File)");

        private final String label; ColorMode(String label) { this.label = label; }
        @Override public String toString() { return label; }
        public static String[] getLabels() { return Arrays.stream(ColorMode.values()).map(ColorMode::toString).toArray(String[]::new); }
        public static ColorMode fromString(String text) { for (ColorMode b : ColorMode.values()) { if (b.label.equalsIgnoreCase(text)) { return b; } } return ZX_NORMAL; }
    }

    // --- Palettes ---
    private final Color[] zxPaletteNormal = { new Color(0,0,0), new Color(0,0,192), new Color(192,0,0), new Color(192,0,192), new Color(0,192,0), new Color(0,192,192), new Color(192,192,0), new Color(192,192,192) };
    private final Color[] zxPaletteBright = { new Color(0,0,0), new Color(0,0,255), new Color(255,0,0), new Color(255,0,255), new Color(0,255,0), new Color(0,255,255), new Color(255,255,0), new Color(255,255,255) };
    // Removed zxPalette15Color as it's no longer used by the primary logic
    private final Color[] bwPalette = { new Color(0,0,0), new Color(255,255,255) };
    private final Color[] brgwPalette = { new Color(0,0,0), new Color(255,0,0), new Color(0,255,0), new Color(255,255,255) };

    // Mapping from Normal index to Bright index (Black maps to Black)
    private final int[] normalToBrightIndex = {0, 1, 2, 3, 4, 5, 6, 7}; // Indices for zxPaletteNormal
    private final Color[] brightLookup = zxPaletteBright; // Reference bright palette

    // --- Plugin Parameters (Global state) ---
    private ImagePlus imp;
    private int blockSizeX = 8; private int blockSizeY = 8;
    private double ditheringLevel = 1.0; private double brightness = 1.0;
    private double contrast = 1.0; private double gamma = 1.0;
    private DitheringMode ditheringMode = DitheringMode.FLOYD_STEINBERG;
    private ColorMode colorMode = ColorMode.ZX_NORMAL;
    private Color[] customPalette = null;
    private String paletteFilePath = "";
    // Heuristic threshold for applying bright attribute
    private double brightAttributeThreshold = 150.0; // Average intensity threshold (0-255)

    // --- Dialog and Preview ---
    private GenericDialog gd;
    private ImagePlus previewImp;

    // --- Setup and Run (Unchanged) ---
    @Override public int setup(String arg, ImagePlus imp) { this.imp = imp; if (imp == null) { IJ.noImage(); return DONE; } if (imp.getType() != ImagePlus.COLOR_RGB) { IJ.error(getClass().getSimpleName(), "Plugin requires an RGB image."); return DONE; } IJ.log(getClass().getSimpleName() + ": Setup complete."); return DOES_RGB; }
    @Override public void run(ImageProcessor ip) { IJ.log(getClass().getSimpleName() + ": Run method started."); try { ColorMode initialColorMode = this.colorMode; Color[] initialCustomPalette = this.customPalette; if (showDialog()) { IJ.log(getClass().getSimpleName() + ": OK clicked. Applying final processing..."); processImage(ip); imp.updateAndDraw(); IJ.log(getClass().getSimpleName() + ": Final processing applied."); } else { IJ.log(getClass().getSimpleName() + ": Dialog canceled."); this.colorMode = initialColorMode; this.customPalette = initialCustomPalette; } } catch (Exception e) { IJ.log("!!! ERROR during showDialog or final processing !!!"); e.printStackTrace(); } finally { IJ.log(getClass().getSimpleName() + ": Cleaning up preview window (if open)."); if (previewImp != null && previewImp.getWindow() != null && previewImp.isVisible()) { previewImp.close(); IJ.log(getClass().getSimpleName() + ": Preview window closed."); } previewImp = null; IJ.log(getClass().getSimpleName() + ": Run method finished."); } }

    // --- Dialog Creation and Handling ---
    private boolean showDialog() { // Mostly unchanged, uses updated ColorMode labels
        IJ.log("showDialog: Creating dialog...");
        gd = new GenericDialog("ZX Spectrum Converter");
        // Block Size (Choice 0)
        String[] blockSizes = {"Disabled", "8x8", "8x4", "8x2", "8x1"}; String defaultBlockSize = "8x8"; if (blockSizeX == 1 && blockSizeY == 1) defaultBlockSize = "Disabled"; else if (blockSizeX == 8 && blockSizeY == 4) defaultBlockSize = "8x4"; else if (blockSizeX == 8 && blockSizeY == 2) defaultBlockSize = "8x2"; else if (blockSizeX == 8 && blockSizeY == 1) defaultBlockSize = "8x1";
        gd.addChoice("Block_Size:", blockSizes, defaultBlockSize); ((Choice) gd.getChoices().lastElement()).addItemListener(this);
        // Dithering Mode (Choice 1)
        gd.addChoice("Dithering_Mode:", DitheringMode.getLabels(), this.ditheringMode.toString()); ((Choice) gd.getChoices().lastElement()).addItemListener(this);
        // Color Mode (Choice 2) - Uses updated labels like "ZX Spectrum (Bright Attribute)"
        gd.addChoice("Color_Mode:", ColorMode.getLabels(), this.colorMode.toString()); ((Choice) gd.getChoices().lastElement()).addItemListener(this);
        // Sliders (Sliders 0-3)
        AdjustmentListener sliderListener = e -> updatePreview();
        gd.addSlider("Dithering_Level", 0, 100, (int) (ditheringLevel * 100)); ((Scrollbar) gd.getSliders().lastElement()).addAdjustmentListener(sliderListener);
        gd.addSlider("Brightness", 0, 200, (int) (brightness * 100)); ((Scrollbar) gd.getSliders().lastElement()).addAdjustmentListener(sliderListener);
        gd.addSlider("Contrast", 0, 200, (int) (contrast * 100)); ((Scrollbar) gd.getSliders().lastElement()).addAdjustmentListener(sliderListener);
        gd.addSlider("Gamma", 1, 300, (int) (gamma * 100)); ((Scrollbar) gd.getSliders().lastElement()).addAdjustmentListener(sliderListener);
        // Load Button
        Button loadPaletteButton = new Button("Load Custom Palette"); loadPaletteButton.addActionListener(this); Panel buttonPanel = new Panel(new FlowLayout(FlowLayout.CENTER)); buttonPanel.add(loadPaletteButton); gd.addPanel(buttonPanel);
        // Threshold slider (Optional, could add later)
        // gd.addSlider("Bright_Threshold", 0, 255, (int) brightAttributeThreshold);
        // ((Scrollbar) gd.getSliders().lastElement()).addAdjustmentListener(sliderListener);

        IJ.log("showDialog: Components added.");
        gd.addWindowListener(new WindowAdapter() { boolean firstShown = false; @Override public void windowActivated(WindowEvent e) { if (!firstShown && gd != null && gd.isShowing()) { IJ.log("showDialog: Dialog window activated, triggering initial preview."); SwingUtilities.invokeLater(() -> { IJ.log("showDialog: Running initial updatePreview via invokeLater."); updatePreview(); }); firstShown = true; } } }); IJ.log("showDialog: WindowListener added.");
        IJ.log("showDialog: Calling gd.showDialog()..."); gd.showDialog(); IJ.log("showDialog: gd.showDialog() returned. Canceled: " + gd.wasCanceled());
        if (gd.wasCanceled()) { return false; }
        IJ.log("showDialog: OK clicked. Reading final values...");
        String blockSizeChoiceString = gd.getNextChoice(); switch (blockSizeChoiceString) { case "Disabled":blockSizeX=1;blockSizeY=1;break; case "8x8":blockSizeX=8;blockSizeY=8;break; case "8x4":blockSizeX=8;blockSizeY=4;break; case "8x2":blockSizeX=8;blockSizeY=2;break; case "8x1":blockSizeX=8;blockSizeY=1;break; }
        String ditheringModeString = gd.getNextChoice(); this.ditheringMode = DitheringMode.fromString(ditheringModeString);
        String colorModeString = gd.getNextChoice(); this.colorMode = ColorMode.fromString(colorModeString);
        if (this.colorMode == ColorMode.CUSTOM && this.customPalette == null) { IJ.log("Warning: Custom palette selected but none loaded. Reverting to ZX Normal."); this.colorMode = ColorMode.ZX_NORMAL; }
        ditheringLevel = gd.getNextNumber() / 100.0; brightness = gd.getNextNumber() / 100.0; contrast = gd.getNextNumber() / 100.0; gamma = gd.getNextNumber() / 100.0;
        // Read threshold if slider was added
        // brightAttributeThreshold = gd.getNextNumber();
        IJ.log("showDialog: Final values read. Dithering=" + this.ditheringMode + ", Color=" + this.colorMode);
        return true;
    }


    // --- Core Image Processing ---
    private void processImage(ImageProcessor ip) {
        BufferedImage bufferedImage = ip.getBufferedImage();
        // Apply BCG first to get the adjusted image (used for brightness heuristic)
        BufferedImage adjustedImage = applyBCG(bufferedImage, this.brightness, this.contrast, this.gamma);
        // Dither the adjusted image based on the selected palette (usually Normal 8 for ZX modes)
        BufferedImage ditheredImage = applyDithering(adjustedImage);
        // Apply block restrictions, passing both adjusted (for brightness check) and dithered images
        BufferedImage zxImage = convertToZXSpectrum(adjustedImage, ditheredImage, this.blockSizeX, this.blockSizeY);
        // Copy result back to ImageJ processor
        if (zxImage.getType() == BufferedImage.TYPE_INT_RGB && ip instanceof ColorProcessor) { int[] pixels = ((DataBufferInt) zxImage.getRaster().getDataBuffer()).getData(); ip.setPixels(pixels); }
        else { ImagePlus tempImp = new ImagePlus("", zxImage); ImageProcessor tempIp = tempImp.getProcessor(); ip.insert(tempIp, 0, 0); }
    }
    private BufferedImage applyBCG(BufferedImage img, double brightness, double contrast, double gamma) { float contrastFactor = (float) contrast; float offset = (float) (128.0 * (1.0 - contrastFactor) + 255.0 * (brightness - 1.0)); RescaleOp rescaleOp = new RescaleOp(contrastFactor, offset, null); BufferedImage contrastBrightImg = rescaleOp.filter(img, null); LookupTable lookupTable = createGammaLookupTable(gamma); LookupOp gammaOp = new LookupOp(lookupTable, null); return gammaOp.filter(contrastBrightImg, null); }
    private LookupTable createGammaLookupTable(double gamma) { if (gamma <= 0) gamma = 0.01; short[] gammaLookup = new short[256]; double exponent = 1.0 / gamma; for (int i = 0; i < 256; i++) gammaLookup[i] = (short) Math.min(255, (int) (255.0 * Math.pow(i / 255.0, exponent) + 0.5)); short[][] lookupData = new short[3][256]; for(int i=0; i<3; i++) System.arraycopy(gammaLookup, 0, lookupData[i], 0, 256); return new ShortLookupTable(0, lookupData); }

    /** Updated applyDithering: Note that getActivePalette returns NORMAL palette for ZX_BRIGHT_ATTRIBUTE mode */
    private BufferedImage applyDithering(BufferedImage image) { int width = image.getWidth(); int height = image.getHeight(); BufferedImage ditheredImage = new BufferedImage(width, height, BufferedImage.TYPE_INT_RGB); Graphics2D g2d = ditheredImage.createGraphics(); g2d.drawImage(image, 0, 0, null); g2d.dispose(); Color[] paletteForDithering = getActivePalette(); // Palette used for quantization/dithering step
        switch (this.ditheringMode) { case FLOYD_STEINBERG: return floydSteinbergDitherProcess(ditheredImage, paletteForDithering); case BAYER_2X2: case BAYER_4X4: case BAYER_8X8: return bayerDitherProcess(ditheredImage, this.ditheringMode.getBayerSize(), paletteForDithering); case HALFTONE: return halftoneDitherProcess(ditheredImage, paletteForDithering);
            default: IJ.log("applyDithering: No dithering applied (mode: " + this.ditheringMode + "). Quantizing only."); BufferedImage quantizedImage = new BufferedImage(width, height, BufferedImage.TYPE_INT_RGB); for (int y = 0; y < height; y++) for (int x = 0; x < width; x++) { Color originalColor = new Color(ditheredImage.getRGB(x, y)); quantizedImage.setRGB(x, y, findClosestColor(originalColor, paletteForDithering).getRGB()); } return quantizedImage; } }

     /** Updated FS Dither to accept and use target palette */
     private BufferedImage floydSteinbergDitherProcess(BufferedImage image, Color[] targetPalette) { int width = image.getWidth(); int height = image.getHeight(); float ditherFactor = (float)this.ditheringLevel; float[] errorR = new float[width]; float[] errorG = new float[width]; float[] errorB = new float[width]; float[] nextErrorR = new float[width]; float[] nextErrorG = new float[width]; float[] nextErrorB = new float[width];
         for (int y = 0; y < height; y++) { Arrays.fill(nextErrorR, 0f); Arrays.fill(nextErrorG, 0f); Arrays.fill(nextErrorB, 0f); float propagatedErrorR = 0, propagatedErrorG = 0, propagatedErrorB = 0;
             for (int x = 0; x < width; x++) { Color originalColor = new Color(image.getRGB(x, y)); int oldR = clamp(originalColor.getRed() + errorR[x] + propagatedErrorR); int oldG = clamp(originalColor.getGreen() + errorG[x] + propagatedErrorG); int oldB = clamp(originalColor.getBlue() + errorB[x] + propagatedErrorB); Color correctedColor = new Color(oldR, oldG, oldB); Color closestColor = findClosestColor(correctedColor, targetPalette); image.setRGB(x, y, closestColor.getRGB()); float errR = (oldR - closestColor.getRed())*ditherFactor; float errG = (oldG - closestColor.getGreen())*ditherFactor; float errB = (oldB - closestColor.getBlue())*ditherFactor; propagatedErrorR = errR*7f/16f; propagatedErrorG = errG*7f/16f; propagatedErrorB = errB*7f/16f; if (x > 0) { nextErrorR[x - 1] += errR*3f/16f; nextErrorG[x - 1] += errG*3f/16f; nextErrorB[x - 1] += errB*3f/16f; } nextErrorR[x] += errR*5f/16f; nextErrorG[x] += errG*5f/16f; nextErrorB[x] += errB*5f/16f; if (x < width - 1) { nextErrorR[x + 1] += errR*1f/16f; nextErrorG[x + 1] += errG*1f/16f; nextErrorB[x + 1] += errB*1f/16f; } }
             System.arraycopy(nextErrorR, 0, errorR, 0, width); System.arraycopy(nextErrorG, 0, errorG, 0, width); System.arraycopy(nextErrorB, 0, errorB, 0, width); } return image; }
     private int clamp(float value) { return Math.max(0, Math.min(255, (int)(value + 0.5f))); } private int clamp(int value) { return Math.max(0, Math.min(255, value)); }
     /** Updated Bayer Dither for size parameter and target palette */
     private BufferedImage bayerDitherProcess(BufferedImage image, int requestedN, Color[] targetPalette) { int width = image.getWidth(); int height = image.getHeight(); BufferedImage outputImage = new BufferedImage(width, height, BufferedImage.TYPE_INT_RGB); int[][] bayerMatrix = getBayerMatrix(requestedN); int actualN = bayerMatrix.length; float ditherFactor = (float)this.ditheringLevel; float thresholdDivisor = (float)(actualN * actualN);
         for (int y = 0; y < height; y++) for (int x = 0; x < width; x++) { Color originalColor = new Color(image.getRGB(x, y)); float threshold = (bayerMatrix[x % actualN][y % actualN] / thresholdDivisor) * 255f * ditherFactor; int r = clamp(originalColor.getRed() + threshold - (127.5f * ditherFactor)); int g = clamp(originalColor.getGreen() + threshold - (127.5f * ditherFactor)); int b = clamp(originalColor.getBlue() + threshold - (127.5f * ditherFactor)); outputImage.setRGB(x, y, findClosestColor(new Color(r, g, b), targetPalette).getRGB()); } return outputImage; }
     /** Updated Halftone Dither to accept and use target palette */
     private BufferedImage halftoneDitherProcess(BufferedImage image, Color[] targetPalette) { int width = image.getWidth(); int height = image.getHeight(); BufferedImage outputImage = new BufferedImage(width, height, BufferedImage.TYPE_INT_RGB); float ditherFactor = (float)this.ditheringLevel;
          for (int y = 0; y < height; y++) for (int x = 0; x < width; x++) { Color originalColor = new Color(image.getRGB(x, y)); float thresholdOffset = ((x + y) % 2 == 0) ? (128f * ditherFactor) : (-128f * ditherFactor); int r = clamp(originalColor.getRed() + thresholdOffset); int g = clamp(originalColor.getGreen() + thresholdOffset); int b = clamp(originalColor.getBlue() + thresholdOffset); outputImage.setRGB(x, y, findClosestColor(new Color(r, g, b), targetPalette).getRGB()); } return outputImage; }
    private int[][] getBayerMatrix(int N) { if (N == 2) { return new int[][]{{0, 2}, {3, 1}}; } if (N < 2 || N > 8 || (N & (N - 1)) != 0) { IJ.log("Warning: Bayer matrix size " + N + " not supported (must be 2, 4, 8). Using 2x2."); return new int[][]{{0, 2}, {3, 1}}; } int[][] smallerMatrix = getBayerMatrix(N / 2); int halfN = N / 2; int[][] matrix = new int[N][N]; for (int y = 0; y < halfN; y++) for (int x = 0; x < halfN; x++) { int val = smallerMatrix[x][y]; matrix[x][y] = 4 * val + 0; matrix[x + halfN][y] = 4 * val + 2; matrix[x][y + halfN] = 4 * val + 3; matrix[x + halfN][y + halfN] = 4 * val + 1; } return matrix; }

    /** Updated convertToZXSpectrum: accepts adjustedImage, fixes block skip logic */
    private BufferedImage convertToZXSpectrum(BufferedImage adjustedImage, BufferedImage ditheredImage, int blockWidth, int blockHeight) {
        int width = ditheredImage.getWidth(); int height = ditheredImage.getHeight();
        BufferedImage zxImage = new BufferedImage(width, height, BufferedImage.TYPE_INT_RGB);

        // *** FIXED Condition: Only skip if block size is effectively 1x1 (Disabled) ***
        if (blockWidth == 1 && blockHeight == 1) {
            Graphics2D g = zxImage.createGraphics();
            g.drawImage(ditheredImage, 0, 0, null); // Just copy dithered image if blocks disabled
            g.dispose();
            IJ.log("convertToZXSpectrum: Block processing skipped (1x1).");
            return zxImage;
        }

        // Process block by block
        for (int yStart = 0; yStart < height; yStart += blockHeight) {
            for (int xStart = 0; xStart < width; xStart += blockWidth) {
                // Pass both images to processBlock
                processBlock(adjustedImage, ditheredImage, zxImage, xStart, yStart, blockWidth, blockHeight);
            }
        }
        return zxImage;
    }

    /** Updated processBlock for Bright Attribute and using activePalette */
     private void processBlock(BufferedImage adjustedImage, BufferedImage ditheredImage, BufferedImage outputImage, int startX, int startY, int blockWidth, int blockHeight) {
        int endX = Math.min(startX + blockWidth, ditheredImage.getWidth());
        int endY = Math.min(startY + blockHeight, ditheredImage.getHeight());
        Color[] activePalette = getActivePalette(); // Palette used for dithering (usually zxPaletteNormal for ZX modes)

        // --- Determine if Bright attribute should be set for this block (heuristic) ---
        boolean useBright = false;
        if (this.colorMode == ColorMode.ZX_BRIGHT_ATTRIBUTE) {
            double totalIntensity = 0;
            int pixelCount = 0;
            for (int y = startY; y < endY; y++) {
                for (int x = startX; x < endX; x++) {
                    // Use adjustedImage (pre-dither) for brightness check
                    Color adjColor = new Color(adjustedImage.getRGB(x, y));
                    // Simple average intensity
                    totalIntensity += (adjColor.getRed() + adjColor.getGreen() + adjColor.getBlue()) / 3.0;
                    pixelCount++;
                }
            }
            if (pixelCount > 0) {
                double avgIntensity = totalIntensity / pixelCount;
                if (avgIntensity >= brightAttributeThreshold) {
                    useBright = true;
                }
            }
        }
        // ---

        // --- Count occurrences of palette colors in the DITHERED block ---
        Map<Color, Integer> colorCounts = new HashMap<>();
        for (int y = startY; y < endY; y++) {
            for (int x = startX; x < endX; x++) {
                 Color ditheredPixelColor = new Color(ditheredImage.getRGB(x, y));
                 // We assume ditheredImage already contains colors from activePalette
                 // If not perfectly quantized, find closest first (already done in dithering steps)
                 Color closestPaletteColor = findClosestColor(ditheredPixelColor, activePalette);
                 colorCounts.put(closestPaletteColor, colorCounts.getOrDefault(closestPaletteColor, 0) + 1);
            }
        }

        // --- Determine Ink and Paper (using colors found in the block) ---
        Color normalInk = (activePalette.length > 0) ? activePalette[0] : Color.BLACK;
        Color normalPaper = (activePalette.length > 1) ? activePalette[1] : Color.WHITE;

        if (!colorCounts.isEmpty()) {
             java.util.List<Map.Entry<Color, Integer>> sortedColors = new java.util.ArrayList<>(colorCounts.entrySet());
             sortedColors.sort((e1, e2) -> e2.getValue().compareTo(e1.getValue()));
             normalInk = sortedColors.get(0).getKey();
             if (sortedColors.size() > 1) {
                 normalPaper = sortedColors.get(1).getKey();
                 if (normalPaper.equals(normalInk)) { normalPaper = findClosestDifferentPaletteColor(normalInk, activePalette); }
             } else { normalPaper = findClosestDifferentPaletteColor(normalInk, activePalette); }
        }

        // --- Apply Bright Attribute if needed ---
        Color finalInk = normalInk;
        Color finalPaper = normalPaper;
        if (useBright) { // Apply bright versions if flag is set
            finalInk = getBrightColor(normalInk);
            finalPaper = getBrightColor(normalPaper);
            // Ensure paper is different from ink even after brightening
            if (finalPaper.equals(finalInk) && activePalette.length > 1) {
                 // If brightening made them same, find closest DIFFERENT bright color to bright ink
                 finalPaper = findClosestDifferentPaletteColor(finalInk, zxPaletteBright); // Search in bright palette
                 // Edge case: if bright palette only has 1 color (black), paper might still equal ink.
            }
        }

        // --- Apply final Ink/Paper Restriction ---
        for (int y = startY; y < endY; y++) {
            for (int x = startX; x < endX; x++) {
                 // Base decision on the DITHERED pixel's closest NORMAL palette color
                 Color ditheredPixelColor = new Color(ditheredImage.getRGB(x, y));
                 Color closestNormalColor = findClosestColor(ditheredPixelColor, activePalette);
                 // Is this closestNormalColor nearer to the block's determined NORMAL Ink or NORMAL Paper?
                 double distToNormalInk = colorDistance(closestNormalColor, normalInk);
                 double distToNormalPaper = colorDistance(closestNormalColor, normalPaper);
                 // Set pixel to the FINAL ink or paper color (which might be bright)
                 outputImage.setRGB(x, y, (distToNormalInk <= distToNormalPaper) ? finalInk.getRGB() : finalPaper.getRGB());
            }
        }
     }

     /** Helper to get the bright version of a normal ZX Spectrum color */
     private Color getBrightColor(Color normalColor) {
         if (normalColor == null) return Color.BLACK;
         // Find the index of the normal color
         for (int i = 0; i < zxPaletteNormal.length; i++) {
             if (zxPaletteNormal[i].equals(normalColor)) {
                 // Black (index 0) stays black
                 if (i == 0) return zxPaletteNormal[0];
                 // Return the corresponding color from the bright palette
                 return zxPaletteBright[i]; // Assumes zxPaletteBright has same order/length
             }
         }
         // If the input color wasn't in the normal palette, return it unchanged? Or return black?
         return normalColor; // Or Color.BLACK;
     }

     private Color findClosestDifferentPaletteColor(Color inputColor, Color[] targetPalette) { Color closest = null; double minDistance = Double.MAX_VALUE; boolean foundDifferent = false; if (targetPalette == null || targetPalette.length < 2) return inputColor; for (Color paletteColor : targetPalette) { if (paletteColor.equals(inputColor)) continue; foundDifferent = true; double distance = colorDistance(inputColor, paletteColor); if (distance < minDistance) { minDistance = distance; closest = paletteColor; } } return foundDifferent ? closest : inputColor; }
    private double colorDistance(Color c1, Color c2) { long r=(long)c1.getRed()-c2.getRed(); long g=(long)c1.getGreen()-c2.getGreen(); long b=(long)c1.getBlue()-c2.getBlue(); return Math.sqrt(r*r + g*g + b*b); }
    private Color findClosestColor(Color input, Color[] targetPalette) { if (targetPalette == null || targetPalette.length == 0) return Color.BLACK; Color closest = targetPalette[0]; double minDistance = Double.MAX_VALUE; for (Color paletteColor : targetPalette) { double distance = colorDistance(input, paletteColor); if (distance < minDistance) { minDistance = distance; closest = paletteColor; } if (minDistance == 0) break; } return closest; }

    // --- Event Handlers ---
    @Override public void actionPerformed(ActionEvent e) { String command = e.getActionCommand(); if (command != null && command.equals("Load Custom Palette")) { IJ.log("Load Palette button clicked."); JFileChooser fileChooser = new JFileChooser(paletteFilePath); FileNameExtensionFilter filter = new FileNameExtensionFilter("Palette Files (*.pal, *.txt, *.csv)", "pal", "txt", "csv"); fileChooser.setFileFilter(filter); int returnVal = fileChooser.showOpenDialog(gd); if (returnVal == JFileChooser.APPROVE_OPTION) { File file = fileChooser.getSelectedFile(); paletteFilePath = file.getAbsolutePath(); boolean loaded = loadPaletteFromFile(paletteFilePath); if (loaded) { IJ.log("Palette loaded successfully, setting mode to Custom and updating preview."); Vector<?> choices = gd.getChoices(); if (choices != null && choices.size() > 2 && choices.get(2) instanceof Choice) { Choice colorModeChoice = (Choice) choices.get(2); colorModeChoice.select(ColorMode.CUSTOM.toString()); } else { updatePreview(); } } } else { IJ.log("Load Palette canceled."); } } }
    @Override public void itemStateChanged(ItemEvent e) { if (gd == null || !(e.getSource() instanceof Choice)) return; Vector<?> choices = gd.getChoices(); if (choices == null || !choices.contains(e.getSource())) return; if (e.getStateChange() == ItemEvent.SELECTED) { if (e.getSource() == choices.get(2)) { if (((Choice)e.getSource()).getSelectedItem().equals(ColorMode.CUSTOM.toString()) && this.customPalette == null) { IJ.log("Custom palette mode selected, but no palette data is loaded yet."); } } updatePreview(); } }

    // --- Preview Update Logic ---
    private void updatePreview() { // IJ.log("updatePreview called.");
        if (gd == null || imp == null || !gd.isShowing()) { return; } Vector<?> choices = gd.getChoices(); Vector<?> sliders = gd.getSliders(); if (choices == null || sliders == null || choices.size() < 3 || sliders.size() < 4) { IJ.log("updatePreview exiting: Component vectors null or insufficient."); return; }
        // Read CURRENT values
        int currentBlockX, currentBlockY; DitheringMode currentDitheringMode; ColorMode currentSelectedColorMode; Color[] currentDitherPalette; // Palette FOR DITHERING step
        double currentDitheringLevel, currentBrightness, currentContrast, currentGamma;
        try { currentBlockX=8; currentBlockY=8; String blockSizeChoiceString=((Choice)choices.get(0)).getSelectedItem(); switch(blockSizeChoiceString){case"Disabled":currentBlockX=1;currentBlockY=1;break; case"8x8":currentBlockX=8;currentBlockY=8;break; case"8x4":currentBlockX=8;currentBlockY=4;break; case"8x2":currentBlockX=8;currentBlockY=2;break; case"8x1":currentBlockX=8;currentBlockY=1;break;} String ditheringModeString=((Choice)choices.get(1)).getSelectedItem(); currentDitheringMode=DitheringMode.fromString(ditheringModeString); String colorModeString=((Choice)choices.get(2)).getSelectedItem(); currentSelectedColorMode=ColorMode.fromString(colorModeString);
             // Determine palette FOR DITHERING (use getActivePalette logic for this context)
             switch(currentSelectedColorMode){case ZX_NORMAL:currentDitherPalette=zxPaletteNormal;break; case ZX_BRIGHT_ATTRIBUTE:currentDitherPalette=zxPaletteNormal;break; /* Dither to normal colors */ case BLACK_AND_WHITE:currentDitherPalette=bwPalette;break; case BLACK_RED_GREEN_WHITE:currentDitherPalette=brgwPalette;break; case CUSTOM:currentDitherPalette=(this.customPalette!=null&&this.customPalette.length>0)?this.customPalette:zxPaletteNormal;break; default:currentDitherPalette=zxPaletteNormal;break;}
             currentDitheringLevel=((Scrollbar)sliders.get(0)).getValue()/100.0; currentBrightness=((Scrollbar)sliders.get(1)).getValue()/100.0; currentContrast=((Scrollbar)sliders.get(2)).getValue()/100.0; currentGamma=((Scrollbar)sliders.get(3)).getValue()/100.0; // IJ.log("Preview values read...");
        } catch (Exception ex) { IJ.log("Error reading dialog components for preview: " + ex.getMessage()); ex.printStackTrace(); return; }

        // --- Process a DUPLICATE image processor for preview ---
        BufferedImage adjustedImagePreview = null; // Need this for brightness heuristic
        ImageProcessor ipPreview = null;
        int backupBlockX=this.blockSizeX; int backupBlockY=this.blockSizeY; DitheringMode backupDithMode = this.ditheringMode; ColorMode backupColorMode = this.colorMode; Color[] backupCustomPalette = this.customPalette; double backupDithLevel=this.ditheringLevel; double backupBright=this.brightness; double backupContrast=this.contrast; double backupGamma=this.gamma;

        try {
            // Set temporary state for processing FIRST
            this.blockSizeX=currentBlockX; this.blockSizeY=currentBlockY; this.ditheringMode=currentDitheringMode; this.colorMode=currentSelectedColorMode; this.customPalette=currentDitherPalette; // Use DITHER palette here for getActivePalette during dither step
            this.ditheringLevel=currentDitheringLevel; this.brightness=currentBrightness; this.contrast=currentContrast; this.gamma=currentGamma;

            // Apply BCG to original for heuristic & dither base
            adjustedImagePreview = applyBCG(imp.getBufferedImage(), this.brightness, this.contrast, this.gamma);
            // Dither based on current state (which uses getActivePalette -> correct dither palette)
            BufferedImage ditheredImagePreview = applyDithering(adjustedImagePreview);
            // Convert using block logic (passes both images)
            BufferedImage zxImagePreview = convertToZXSpectrum(adjustedImagePreview, ditheredImagePreview, this.blockSizeX, this.blockSizeY);
            // Get ImageProcessor from final result
            ipPreview = new ColorProcessor(zxImagePreview);

        } catch (Exception ex) {
             IJ.log("!!! Error during preview image processing: " + ex.getMessage() + " !!!"); ex.printStackTrace(); ipPreview = null; // Ensure ipPreview is null on error
        } finally {
            // *** Restore original global state REGARDLESS of success or failure ***
             this.blockSizeX=backupBlockX; this.blockSizeY=backupBlockY; this.ditheringMode=backupDithMode; this.colorMode=backupColorMode; this.customPalette=backupCustomPalette; // Restore original custom palette ref
             this.ditheringLevel=backupDithLevel; this.brightness=backupBright; this.contrast=backupContrast; this.gamma=backupGamma; // IJ.log("Preview state restored.");
        }

        if (ipPreview == null) { IJ.log("updatePreview exiting: Preview ImageProcessor is null after processing attempt."); return; }
        final ImageProcessor finalIpPreview = ipPreview; // Final variable for lambda

        // --- Update the preview window ---
        SwingUtilities.invokeLater(() -> { try { boolean previewExistsAndVisible=(previewImp!=null && previewImp.getWindow()!=null && previewImp.isVisible()); if (!previewExistsAndVisible) { if (previewImp!=null) previewImp.close(); previewImp=new ImagePlus("Preview ["+imp.getShortTitle()+"]", finalIpPreview); previewImp.show(); ImageWindow win=previewImp.getWindow(); if(win!=null&&gd!=null&&gd.isShowing()){Point dialogLoc=gd.getLocationOnScreen();int dialogWidth=gd.getWidth();Dimension screenSize=Toolkit.getDefaultToolkit().getScreenSize(); int xPos=dialogLoc.x+dialogWidth+10;int yPos=dialogLoc.y; if(xPos>screenSize.width-win.getWidth()){xPos=dialogLoc.x-win.getWidth()-10;} if(yPos>screenSize.height-win.getHeight()){yPos=screenSize.height-win.getHeight()-10;} xPos=Math.max(0,xPos);yPos=Math.max(0,yPos); win.setLocation(xPos,yPos);}} else { previewImp.setProcessor(finalIpPreview); previewImp.updateAndDraw(); } } catch (Exception e) { IJ.log("!!! Exception inside invokeLater while updating preview window !!!"); e.printStackTrace(); if(previewImp!=null) previewImp.close(); previewImp=null; } });
    }


    // --- Palette Loading ---
    private boolean loadPaletteFromFile(String filePath) { java.util.List<Color> loadedPalette = new java.util.ArrayList<>(); try (BufferedReader br = new BufferedReader(new FileReader(filePath))) { String line; int lineNum = 0; while ((line = br.readLine()) != null) { lineNum++; line = line.trim(); if (line.isEmpty() || line.startsWith("#") || line.startsWith(";")) continue; String[] values = line.split("[,\\s]+"); if (values.length == 3) { try { int r=clamp(Integer.parseInt(values[0].trim())); int g=clamp(Integer.parseInt(values[1].trim())); int b=clamp(Integer.parseInt(values[2].trim())); loadedPalette.add(new Color(r, g, b)); } catch (NumberFormatException nfe) { IJ.log("Warning: Invalid number format on line " + lineNum + ": " + line); } } else { IJ.log("Warning: Skipping malformed line " + lineNum + ": " + line); } } if (!loadedPalette.isEmpty()) { this.customPalette = loadedPalette.toArray(new Color[0]); IJ.log("Loaded " + this.customPalette.length + " colors from " + new File(filePath).getName()); return true; } else { IJ.error("Palette Loading", "No valid colors found in file."); this.customPalette = null; return false; } } catch (IOException ex) { IJ.error("Palette Loading Error", "Error reading file:\n" + ex.getMessage()); this.customPalette = null; return false; } }

    // --- Helper Methods ---
    /** Updated Helper to get the currently active palette based on colorMode */
    private Color[] getActivePalette() {
        // NOTE: This palette is used for the *dithering* step.
        // For ZX_BRIGHT_ATTRIBUTE mode, we dither to NORMAL colors.
        switch (this.colorMode) {
            case ZX_NORMAL:             return zxPaletteNormal;
            case ZX_BRIGHT_ATTRIBUTE:   return zxPaletteNormal; // Dither/Quantize to NORMAL palette
            case BLACK_AND_WHITE:       return bwPalette;
            case BLACK_RED_GREEN_WHITE: return brgwPalette;
            case CUSTOM:                return (this.customPalette != null && this.customPalette.length > 0) ? this.customPalette : zxPaletteNormal; // Fallback
            default:                    return zxPaletteNormal;
        }
    }
    // Bayer size helper updated for removed 16x16
    private int getBayerSizeFromIndex(int index) { switch (index) { case 0: return 2; case 1: return 4; case 2: return 8; default: IJ.log("Warning: Invalid Bayer index " + index + ". Defaulting to size 4."); return 4; } }

} // End of ZX_Spectrum_Converter class
