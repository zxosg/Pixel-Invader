import ij.*;
import ij.process.*;
import ij.gui.*;
import ij.plugin.frame.PlugInFrame;
import java.awt.*;
import java.awt.event.*;
import java.io.*;
import java.util.Arrays;
import java.util.HashMap;
import java.util.LinkedHashSet;
import java.util.Map;
import java.util.concurrent.CancellationException;
import javax.swing.*;
import javax.swing.filechooser.FileNameExtensionFilter;
import java.awt.image.BufferedImage;
import java.awt.image.RescaleOp;
import java.awt.image.LookupTable;
import java.awt.image.LookupOp;
import java.awt.image.ShortLookupTable;
import java.awt.image.DataBufferInt;

/**
 * ZX Spectrum Converter6
 *
 * ImageJ plugin using PlugInFrame.
 * Version: ZX_Spectrum_Converter6 (Interlace mode updated)
 *
 * Interlaced mode now works as follows:
 * - The image is divided into blocks of the user‐defined block size.
 * - For each block, the average RGB (and thus luminance) is computed.
 * - The plugin then chooses the best distinct pair of colors from an extended ZX palette (normal + bright)
 *   so that the average of these two colors best approximates the block average.
 * - It then computes, per block, the ideal fraction “f” (between 0 and 1) of ink pixels needed.
 * - Using a normalized Bayer matrix (ordered dither) generated over the block area,
 *   each pixel in the block is assigned to “ink” or “paper” for frame A, and an inverted assignment is used for frame B.
 * - Finally, the output is the per-pixel average of frame A and frame B.
 *
 * This method produces a finer halftone appearance while keeping each block limited to two colors.
 */
public class ZX_Spectrum_Converter6 extends PlugInFrame 
        implements ActionListener, ItemListener, AdjustmentListener {

    // --- Enums for Modes ---
    private enum DitheringMode {
        FLOYD_STEINBERG("Floyd-Steinberg"),
        ATKINSON("Atkinson"),
        JARVIS_JUDICE_NINKE("Jarvis, Judice, Ninke"),
        HALFTONE("Halftone"),
        BAYER_2X2("Bayer 2x2"),
        BAYER_4X4("Bayer 4x4"),
        BAYER_8X8("Bayer 8x8");

        private final String label;
        DitheringMode(String label) { this.label = label; }
        @Override public String toString() { return label; }
        public static String[] getLabels() {
            return Arrays.stream(DitheringMode.values())
                    .map(DitheringMode::toString)
                    .toArray(String[]::new);
        }
        public static DitheringMode fromString(String text) {
            for (DitheringMode mode : DitheringMode.values()) {
                if (mode.label.equalsIgnoreCase(text))
                    return mode;
            }
            return FLOYD_STEINBERG;
        }
        public int getBayerSize() {
            switch (this) {
                case BAYER_2X2: return 2;
                case BAYER_4X4: return 4;
                case BAYER_8X8: return 8;
                default: return 0;
            }
        }
    }

    private enum ColorMode {
        ZX_NORMAL("ZX Spectrum (Normal)"),
        ZX_BRIGHT_ATTRIBUTE("ZX Spectrum (Bright Attribute)"),
        ZX_INTERLACED_NB("ZX Interlaced (Normal/Bright)"),
        C64("Commodore 64"),
        EGA("EGA (16 Color)"),
        BLACK_AND_WHITE("Black and White"),
        BLACK_RED_GREEN_WHITE("Black/Red/Green/White"),
        USER_DEFINED("User Defined Subset"),
        CUSTOM("Custom (External File)");

        private final String label;
        ColorMode(String label) { this.label = label; }
        @Override public String toString() { return label; }
        public static String[] getLabels() {
            return Arrays.stream(ColorMode.values())
                    .map(ColorMode::toString)
                    .toArray(String[]::new);
        }
        public static ColorMode fromString(String text) {
            for (ColorMode mode : ColorMode.values()) {
                if (mode.label.equalsIgnoreCase(text))
                    return mode;
            }
            return ZX_NORMAL;
        }
    }

    // --- Palettes ---
    private final Color[] zxPaletteNormal = {
        new Color(0, 0, 0), new Color(0, 0, 192), new Color(192, 0, 0),
        new Color(192, 0, 192), new Color(0, 192, 0), new Color(0, 192, 192),
        new Color(192, 192, 0), new Color(192, 192, 192)
    };

    private final Color[] zxPaletteBright = {
        new Color(0, 0, 0), new Color(0, 0, 255), new Color(255, 0, 0),
        new Color(255, 0, 255), new Color(0, 255, 0), new Color(0, 255, 255),
        new Color(255, 255, 0), new Color(255, 255, 255)
    };

    private final Color[] c64Palette = {
        new Color(0, 0, 0), new Color(255, 255, 255), new Color(136, 0, 0),
        new Color(170, 255, 238), new Color(204, 68, 204), new Color(0, 204, 85),
        new Color(0, 0, 170), new Color(238, 238, 119), new Color(221, 136, 85),
        new Color(102, 68, 0), new Color(255, 119, 119), new Color(51, 51, 51),
        new Color(119, 119, 119), new Color(170, 255, 102), new Color(0, 119, 221),
        new Color(187, 187, 187)
    };

    private final Color[] egaPalette = {
        new Color(0, 0, 0), new Color(0, 0, 170), new Color(0, 170, 0),
        new Color(0, 170, 170), new Color(170, 0, 0), new Color(170, 0, 170),
        new Color(170, 85, 0), new Color(170, 170, 170), new Color(85, 85, 85),
        new Color(85, 85, 255), new Color(85, 255, 85), new Color(85, 255, 255),
        new Color(255, 85, 85), new Color(255, 85, 255), new Color(255, 255, 85),
        new Color(255, 255, 255)
    };

    private final Color[] bwPalette = {
        new Color(0, 0, 0), new Color(255, 255, 255)
    };

    private final Color[] brgwPalette = {
        new Color(0, 0, 0), new Color(255, 0, 0),
        new Color(0, 255, 0), new Color(255, 255, 255)
    };

    // --- Plugin Parameters ---
    private ImagePlus sourceImp;
    private ImagePlus previewImp;
    private int blockSizeX = 8;
    private int blockSizeY = 8;
    private double ditheringLevel = 1.0;
    private double brightness = 1.0;
    private double contrast = 1.0;
    private double gamma = 1.0;
    private DitheringMode ditheringMode = DitheringMode.FLOYD_STEINBERG;
    private ColorMode colorMode = ColorMode.ZX_NORMAL;
    private Color[] customPalette = null;
    private String paletteFilePath = "";
    private double brightAttributeThreshold = 150.0;
    private boolean userUseBlack = true;
    private boolean userUseBlue = true;
    private boolean userUseRed = true;
    private boolean userUseMagenta = true;
    private boolean userUseGreen = true;
    private boolean userUseCyan = true;
    private boolean userUseYellow = true;
    private boolean userUseWhite = true;
    private boolean userAllowBright = false;
    private double currentMagnification = 1.0;

    // --- UI Components ---
    private Panel controlPanel, displayPanel, imagePanel, scalePanel;
    private ImageCanvas sourceCanvas, previewCanvas;
    private PalettePreviewCanvas paletteCanvas;
    private Panel userDefinedPanel;
    private Choice blockSizeChoice, ditherModeChoice, colorModeChoice;
    private Checkbox cbUseBlack, cbUseBlue, cbUseRed, cbUseMagenta, 
                     cbUseGreen, cbUseCyan, cbUseYellow, cbUseWhite, cbAllowBright;
    private Scrollbar ditherScroll, brightScroll, contrastScroll, gammaScroll;
    private Button loadPaletteButton, applyButton;
    private CheckboxGroup scaleGroup;
    private Checkbox scale1x, scale2x, scale3x;

    // --- Concurrency ---
    private PreviewWorker currentWorker = null;

    // --- Custom Canvas for Palette Preview ---
    private class PalettePreviewCanvas extends Canvas {
        private static final int PREF_HEIGHT = 20;
        PalettePreviewCanvas() { setPreferredSize(new Dimension(200, PREF_HEIGHT)); }
        @Override
        public void paint(Graphics g) {
            Color[] currentPalette = getActivePalette();
            if (currentPalette == null || currentPalette.length == 0) {
                g.setColor(Color.GRAY);
                g.fillRect(0, 0, getWidth(), getHeight());
                g.setColor(Color.BLACK);
                g.drawString("No Palette", 5, getHeight()-5);
                return;
            }
            int w = getWidth(), h = getHeight();
            int blockW = Math.max(1, w / currentPalette.length);
            for (int i = 0; i < currentPalette.length; i++) {
                g.setColor(currentPalette[i]);
                int x = i * blockW;
                int curW = (i == currentPalette.length - 1) ? (w - x) : blockW;
                g.fillRect(x, 0, curW, h);
            }
        }
        @Override
        public Dimension getPreferredSize() { return new Dimension(200, PREF_HEIGHT); }
        @Override
        public Dimension getMinimumSize() { return getPreferredSize(); }
    }

    // --- Constructor ---
    public ZX_Spectrum_Converter6() {
        super("ZX Spectrum Converter6");
    }

    // --- PlugInFrame Entry Point ---
    @Override
    public void run(String arg) {
        sourceImp = WindowManager.getCurrentImage();
        if (sourceImp == null) { IJ.noImage(); return; }
        if (sourceImp.getType() != ImagePlus.COLOR_RGB) {
            IJ.error(getTitle(), "Plugin requires an RGB image.");
            return;
        }
        String frameTitle = "ZX Spectrum Converter6" + " [" + sourceImp.getID() + "]";
        Frame existingFrame = WindowManager.getFrame(frameTitle);
        if (existingFrame != null) { existingFrame.toFront(); return; }
        setTitle(frameTitle);
        setupUI();
        pack();
        GUI.center(this);
        setVisible(true);
        triggerPreviewUpdate();
    }

    // --- UI Setup Method (unchanged except title text) ---
    private void setupUI() {
        setLayout(new BorderLayout(5,5));
        controlPanel = new Panel();
        GridBagLayout gbl = new GridBagLayout();
        GridBagConstraints gbc = new GridBagConstraints();
        controlPanel.setLayout(gbl);
        Insets weightyDefaults = new Insets(2,5,2,5);
        int gridY = 0;
        // Block Size
        gbc.gridx = 0; gbc.gridy = gridY; gbc.gridwidth = 1; gbc.anchor = GridBagConstraints.EAST; gbc.insets = weightyDefaults;
        controlPanel.add(new Label("Block Size:"), gbc);
        gbc.gridx = 1; gbc.anchor = GridBagConstraints.WEST; gbc.fill = GridBagConstraints.HORIZONTAL;
        blockSizeChoice = new Choice();
        for (String s : new String[]{"Disabled", "8x8", "8x4", "8x2", "8x1"}) blockSizeChoice.add(s);
        blockSizeChoice.select("8x8");
        blockSizeChoice.addItemListener(this);
        controlPanel.add(blockSizeChoice, gbc);
        gridY++;
        // Dithering Mode
        gbc.gridx = 0; gbc.gridy = gridY; gbc.anchor = GridBagConstraints.EAST; gbc.fill = GridBagConstraints.NONE;
        controlPanel.add(new Label("Dithering:"), gbc);
        gbc.gridx = 1; gbc.anchor = GridBagConstraints.WEST; gbc.fill = GridBagConstraints.HORIZONTAL;
        ditherModeChoice = new Choice();
        for (String s : DitheringMode.getLabels()) ditherModeChoice.add(s);
        ditherModeChoice.select(ditheringMode.toString());
        ditherModeChoice.addItemListener(this);
        controlPanel.add(ditherModeChoice, gbc);
        gridY++;
        // Color Mode
        gbc.gridx = 0; gbc.gridy = gridY; gbc.anchor = GridBagConstraints.EAST; gbc.fill = GridBagConstraints.NONE;
        controlPanel.add(new Label("Color Mode:"), gbc);
        gbc.gridx = 1; gbc.anchor = GridBagConstraints.WEST; gbc.fill = GridBagConstraints.HORIZONTAL;
        colorModeChoice = new Choice();
        for (String s : ColorMode.getLabels()) colorModeChoice.add(s);
        colorModeChoice.select(colorMode.toString());
        colorModeChoice.addItemListener(this);
        controlPanel.add(colorModeChoice, gbc);
        gridY++;
        // User Defined Panel
        userDefinedPanel = new Panel();
        userDefinedPanel.setLayout(new BoxLayout(userDefinedPanel, BoxLayout.Y_AXIS));
        Label userDefinedLabel = new Label("User Defined Palette Colors:");
        userDefinedLabel.setAlignment(Label.LEFT);
        userDefinedPanel.add(userDefinedLabel);
        Panel checkboxGrid = new Panel(new java.awt.GridLayout(0,1));
        cbUseBlack = new Checkbox("Use Black", userUseBlack); cbUseBlack.addItemListener(this); checkboxGrid.add(cbUseBlack);
        cbUseBlue = new Checkbox("Use Blue", userUseBlue); cbUseBlue.addItemListener(this); checkboxGrid.add(cbUseBlue);
        cbUseRed = new Checkbox("Use Red", userUseRed); cbUseRed.addItemListener(this); checkboxGrid.add(cbUseRed);
        cbUseMagenta = new Checkbox("Use Magenta", userUseMagenta); cbUseMagenta.addItemListener(this); checkboxGrid.add(cbUseMagenta);
        cbUseGreen = new Checkbox("Use Green", userUseGreen); cbUseGreen.addItemListener(this); checkboxGrid.add(cbUseGreen);
        cbUseCyan = new Checkbox("Use Cyan", userUseCyan); cbUseCyan.addItemListener(this); checkboxGrid.add(cbUseCyan);
        cbUseYellow = new Checkbox("Use Yellow", userUseYellow); cbUseYellow.addItemListener(this); checkboxGrid.add(cbUseYellow);
        cbUseWhite = new Checkbox("Use White", userUseWhite); cbUseWhite.addItemListener(this); checkboxGrid.add(cbUseWhite);
        cbAllowBright = new Checkbox("Allow Bright Versions", userAllowBright); cbAllowBright.addItemListener(this); checkboxGrid.add(cbAllowBright);
        userDefinedPanel.add(checkboxGrid);
        gbc.gridx = 0; gbc.gridy = gridY; gbc.gridwidth = 2; gbc.anchor = GridBagConstraints.WEST; gbc.fill = GridBagConstraints.HORIZONTAL;
        gbc.insets = new Insets(10,5,0,5);
        controlPanel.add(userDefinedPanel, gbc);
        gridY++;
        // Sliders: Dither Level, Brightness, Contrast, Gamma
        gbc.gridwidth = 1; gbc.insets = weightyDefaults;
        ditherScroll = addSlider(controlPanel, "Dither Level:", 0, 100, (int)(ditheringLevel * 100), gbc, gridY++);
        brightScroll = addSlider(controlPanel, "Brightness:", 0, 200, (int)(brightness * 100), gbc, gridY++);
        contrastScroll = addSlider(controlPanel, "Contrast:", 0, 200, (int)(contrast * 100), gbc, gridY++);
        gammaScroll = addSlider(controlPanel, "Gamma:", 1, 300, (int)(gamma * 100), gbc, gridY++);
        // Buttons Row
        gbc.gridx = 0; gbc.gridy = gridY; gbc.gridwidth = 2; gbc.anchor = GridBagConstraints.CENTER; gbc.fill = GridBagConstraints.NONE;
        gbc.insets = new Insets(10,5,2,5);
        Panel buttonRow = new Panel(new FlowLayout());
        loadPaletteButton = new Button("Load Custom Palette");
        loadPaletteButton.addActionListener(this);
        applyButton = new Button("Apply to Original");
        applyButton.addActionListener(this);
        buttonRow.add(loadPaletteButton);
        buttonRow.add(applyButton);
        controlPanel.add(buttonRow, gbc);
        gridY++;
        Panel controlWrapperPanel = new Panel(new BorderLayout());
        controlWrapperPanel.add(controlPanel, BorderLayout.NORTH);
        add(controlWrapperPanel, BorderLayout.WEST);
        // Image Panels
        displayPanel = new Panel(new BorderLayout(5,5));
        imagePanel = new Panel(new java.awt.GridLayout(1,2,5,5));
        sourceCanvas = new ImageCanvas(sourceImp);
        ImageProcessor blankIp = sourceImp.getProcessor().createProcessor(sourceImp.getWidth(), sourceImp.getHeight());
        previewImp = new ImagePlus("Preview", blankIp);
        previewCanvas = new ImageCanvas(previewImp);
        imagePanel.add(sourceCanvas);
        imagePanel.add(previewCanvas);
        displayPanel.add(imagePanel, BorderLayout.CENTER);
        // Scale Panel / Zoom
        scalePanel = new Panel(new FlowLayout(FlowLayout.CENTER));
        scaleGroup = new CheckboxGroup();
        scale1x = new Checkbox("1x", scaleGroup, true); scale1x.addItemListener(this);
        scale2x = new Checkbox("2x", scaleGroup, false); scale2x.addItemListener(this);
        scale3x = new Checkbox("3x", scaleGroup, false); scale3x.addItemListener(this);
        scalePanel.add(new Label("Zoom:")); scalePanel.add(scale1x); scalePanel.add(scale2x); scalePanel.add(scale3x);
        displayPanel.add(scalePanel, BorderLayout.NORTH);
        add(displayPanel, BorderLayout.CENTER);
        // Palette Preview Canvas
        paletteCanvas = new PalettePreviewCanvas();
        add(paletteCanvas, BorderLayout.SOUTH);
        updateComponentVisibility();
        addWindowListener(new WindowAdapter() { @Override public void windowClosing(WindowEvent e) { close(); currentWorker = null; }});
    }

    // --- Helper for adding a Checkbox ---
    private Checkbox addCheckbox(Panel p, String label, boolean state, GridBagConstraints gbc, int y) {
        gbc.gridx = 0; gbc.gridy = y; gbc.anchor = GridBagConstraints.EAST; gbc.fill = GridBagConstraints.NONE;
        p.add(new Label(""), gbc);
        gbc.gridx = 1; gbc.anchor = GridBagConstraints.WEST;
        Checkbox cb = new Checkbox(label, state);
        cb.addItemListener(this);
        p.add(cb, gbc);
        return cb;
    }

    // --- Helper for adding a Slider ---
    private Scrollbar addSlider(Panel p, String label, int min, int max, int value,
                                GridBagConstraints gbc, int y) {
        gbc.gridx = 0; gbc.gridy = y; gbc.anchor = GridBagConstraints.EAST; gbc.fill = GridBagConstraints.NONE;
        p.add(new Label(label), gbc);
        gbc.gridx = 1; gbc.anchor = GridBagConstraints.WEST; gbc.fill = GridBagConstraints.HORIZONTAL; gbc.weightx = 1.0;
        Scrollbar sb = new Scrollbar(Scrollbar.HORIZONTAL, value, 1, min, max+1);
        sb.addAdjustmentListener(this);
        p.add(sb, gbc);
        gbc.weightx = 0.0;
        return sb;
    }

    // --- Event Handlers ---
    @Override public void actionPerformed(ActionEvent e) {
        Object source = e.getSource();
        if (source == loadPaletteButton) { loadPaletteAction(); }
        else if (source == applyButton) { applyChangesAction(); }
    }
    @Override public void itemStateChanged(ItemEvent e) {
        Object source = e.getSource();
        if (source == scale1x || source == scale2x || source == scale3x) { updateMagnification(); triggerPreviewUpdate(); }
        else { if (source == colorModeChoice) { updateComponentVisibility(); } triggerPreviewUpdate(); }
    }
    @Override public void adjustmentValueChanged(AdjustmentEvent e) { triggerPreviewUpdate(); }

    // --- Actions ---
    private void loadPaletteAction() {
        IJ.log("Load Palette button clicked.");
        JFileChooser fileChooser = new JFileChooser(paletteFilePath);
        FileNameExtensionFilter filter = new FileNameExtensionFilter("Palette Files (*.pal, *.txt, *.csv)", "pal", "txt", "csv");
        fileChooser.setFileFilter(filter);
        int returnVal = fileChooser.showOpenDialog(this);
        if (returnVal == JFileChooser.APPROVE_OPTION) {
            File file = fileChooser.getSelectedFile();
            paletteFilePath = file.getAbsolutePath();
            boolean loaded = loadPaletteFromFile(paletteFilePath);
            if (loaded) {
                IJ.log("Palette loaded successfully, setting mode to Custom and updating preview.");
                colorModeChoice.select(ColorMode.CUSTOM.toString());
                updateComponentVisibility();
                triggerPreviewUpdate();
            }
        } else { IJ.log("Load Palette canceled."); }
    }
    private void applyChangesAction() {
        IJ.log("Apply button clicked.");
        if (sourceImp == null) return;
        readUISettings();
        IJ.log(String.format("ApplyAction: Block=%dx%d Dither=%s Color=%s DLevel=%.2f BCG=%.1f/%.1f/%.1f UserBright=%b",
                this.blockSizeX, this.blockSizeY, this.ditheringMode, this.colorMode,
                this.ditheringLevel, this.brightness, this.contrast, this.gamma, this.userAllowBright));
        Color[] applyPalette = getActivePalette();
        IJ.log("ApplyAction: Active Palette Size = " + (applyPalette != null ? applyPalette.length : "null"));
        ImageProcessor ipToProcess = sourceImp.getProcessor();
        ImageProcessor backupIp = ipToProcess.duplicate();
        try {
            IJ.showStatus("Applying ZX Spectrum Conversion...");
            processImage(ipToProcess, this.blockSizeX, this.blockSizeY, this.ditheringMode, this.colorMode,
                    applyPalette, this.customPalette, getUserDefinedFlags(),
                    this.ditheringLevel, this.brightness, this.contrast, this.gamma, this.brightAttributeThreshold);
            sourceImp.updateAndDraw();
            IJ.showStatus("Applied ZX Spectrum Conversion.");
        } catch (Exception e) {
            IJ.error("Error applying changes: " + e.getMessage());
            sourceImp.setProcessor(backupIp);
            sourceImp.updateAndDraw();
            IJ.showStatus("Error applying changes. Original restored.");
            e.printStackTrace();
        }
    }
    private void readUISettings() {
        String bs = blockSizeChoice.getSelectedItem();
        if (bs.equals("Disabled")) { blockSizeX = 1; blockSizeY = 1; }
        else if (bs.equals("8x8")) { blockSizeX = 8; blockSizeY = 8; }
        else if (bs.equals("8x4")) { blockSizeX = 8; blockSizeY = 4; }
        else if (bs.equals("8x2")) { blockSizeX = 8; blockSizeY = 2; }
        else if (bs.equals("8x1")) { blockSizeX = 8; blockSizeY = 1; }
        ditheringMode = DitheringMode.fromString(ditherModeChoice.getSelectedItem());
        colorMode = ColorMode.fromString(colorModeChoice.getSelectedItem());
        userUseBlack = cbUseBlack.getState();
        userUseBlue = cbUseBlue.getState();
        userUseRed = cbUseRed.getState();
        userUseMagenta = cbUseMagenta.getState();
        userUseGreen = cbUseGreen.getState();
        userUseCyan = cbUseCyan.getState();
        userUseYellow = cbUseYellow.getState();
        userUseWhite = cbUseWhite.getState();
        userAllowBright = cbAllowBright.getState();
        ditheringLevel = ditherScroll.getValue() / 100.0;
        brightness = brightScroll.getValue() / 100.0;
        contrast = contrastScroll.getValue() / 100.0;
        gamma = gammaScroll.getValue() / 100.0;
        if (this.colorMode == ColorMode.CUSTOM && this.customPalette == null) {
            IJ.log("Warning: Custom mode selected but no palette loaded.");
            this.colorMode = ColorMode.ZX_NORMAL;
        }
    }

    // --- Magnification Update ---
    private void updateMagnification() {
        if (sourceCanvas == null || previewCanvas == null || scaleGroup == null ||
            controlPanel == null || displayPanel == null || paletteCanvas == null ||
            imagePanel == null || sourceImp == null) return;
        Checkbox selected = scaleGroup.getSelectedCheckbox();
        double newMag = 1.0;
        if (selected == scale2x) newMag = 2.0; else if (selected == scale3x) newMag = 3.0;
        if (newMag != currentMagnification) {
            IJ.log("Setting Magnification from " + currentMagnification + " to " + newMag);
            sourceCanvas.setMagnification(newMag);
            previewCanvas.setMagnification(newMag);
            currentMagnification = newMag;
            int newCanvasWidth = (int)(sourceImp.getWidth()*newMag);
            int newCanvasHeight = (int)(sourceImp.getHeight()*newMag);
            Dimension newSize = new Dimension(newCanvasWidth, newCanvasHeight);
            sourceCanvas.setPreferredSize(newSize);
            sourceCanvas.setSize(newSize);
            sourceCanvas.revalidate(); sourceCanvas.repaint();
            previewCanvas.setPreferredSize(newSize);
            previewCanvas.setSize(newSize);
            previewCanvas.revalidate(); previewCanvas.repaint();
            imagePanel.revalidate(); imagePanel.repaint();
            this.pack();
        }
    }
    private void triggerPreviewUpdate() {
        if (sourceImp == null) return;
        readUISettings();
        PreviewParameters params = new PreviewParameters(
            sourceImp.getProcessor(), blockSizeX, blockSizeY, ditheringMode, colorMode,
            getActivePalette(), customPalette, getUserDefinedFlags(),
            ditheringLevel, brightness, contrast, gamma, brightAttributeThreshold
        );
        if (currentWorker != null && !currentWorker.isDone())
            currentWorker.cancel(true);
        currentWorker = new PreviewWorker(params);
        currentWorker.execute();
    }

    // --- Core Image Processing Method ---
    void processImage(ImageProcessor ip, int blockX, int blockY, DitheringMode dMode, ColorMode cMode,
                      Color[] activePal, Color[] custPal, boolean[] userFlgs,
                      double dLevel, double bright, double cont, double gam, double brightThresh) {
        BufferedImage bufferedImage = ip.getBufferedImage();
        BufferedImage adjustedImage = applyBCG(bufferedImage, bright, cont, gam);
        BufferedImage finalZxImage;
        if (cMode == ColorMode.ZX_INTERLACED_NB) {
            IJ.log("Processing Interlaced Mode...");
            finalZxImage = interlacedDitherProcess(adjustedImage, blockX, blockY);
            IJ.log("Interlaced Mode processing complete.");
        } else {
            BufferedImage ditheredImage = applyDithering(adjustedImage, dMode, activePal, dLevel);
            finalZxImage = convertToZXSpectrum(adjustedImage, ditheredImage,
                    blockX, blockY, cMode, userFlgs[8], brightThresh, activePal);
        }
        if (finalZxImage.getType() == BufferedImage.TYPE_INT_RGB && ip instanceof ColorProcessor) {
            int[] pixels = ((DataBufferInt) finalZxImage.getRaster().getDataBuffer()).getData();
            ip.setPixels(pixels);
        } else {
            ImagePlus tempImp = new ImagePlus("", finalZxImage);
            ImageProcessor tempIp = tempImp.getProcessor();
            ip.insert(tempIp, 0, 0);
        }
    }

    BufferedImage applyBCG(BufferedImage img, double brightnessParam, double contrastParam, double gammaParam) {
        float contrastFactor = (float)contrastParam;
        float offset = (float)(128.0*(1.0-contrastFactor) + 255.0*(brightnessParam-1.0));
        RescaleOp rescaleOp = new RescaleOp(contrastFactor, offset, null);
        BufferedImage contrastBrightImg = rescaleOp.filter(img, null);
        LookupTable lookupTable = createGammaLookupTable(gammaParam);
        LookupOp gammaOp = new LookupOp(lookupTable, null);
        return gammaOp.filter(contrastBrightImg, null);
    }
    LookupTable createGammaLookupTable(double gammaParam) {
        if (gammaParam <= 0) gammaParam = 0.01;
        short[] gammaLookup = new short[256];
        double exponent = 1.0/gammaParam;
        for (int i = 0; i < 256; i++) {
            gammaLookup[i] = (short)Math.min(255, (int)(255.0*Math.pow(i/255.0, exponent)+0.5));
        }
        short[][] lookupData = new short[3][256];
        for (int i = 0; i < 3; i++) System.arraycopy(gammaLookup, 0, lookupData[i], 0, 256);
        return new ShortLookupTable(0, lookupData);
    }

    BufferedImage applyDithering(BufferedImage image, DitheringMode mode, Color[] paletteForDithering, double level) {
        int width = image.getWidth(), height = image.getHeight();
        BufferedImage ditheredImage = new BufferedImage(width, height, BufferedImage.TYPE_INT_RGB);
        Graphics2D g2d = ditheredImage.createGraphics();
        g2d.drawImage(image, 0, 0, null);
        g2d.dispose();
        switch (mode) {
            case FLOYD_STEINBERG: return floydSteinbergDitherProcess(ditheredImage, paletteForDithering, level);
            case ATKINSON: return atkinsonDitherProcess(ditheredImage, paletteForDithering, level);
            case JARVIS_JUDICE_NINKE: return jjnDitherProcess(ditheredImage, paletteForDithering, level);
            case BAYER_2X2:
            case BAYER_4X4:
            case BAYER_8X8: return bayerDitherProcess(ditheredImage, mode.getBayerSize(), paletteForDithering, level);
            case HALFTONE: return halftoneDitherProcess(ditheredImage, paletteForDithering, level);
            default:
                IJ.log("applyDithering: Quantizing only.");
                BufferedImage q = new BufferedImage(width, height, BufferedImage.TYPE_INT_RGB);
                for (int y = 0; y < height; y++)
                    for (int x = 0; x < width; x++)
                        q.setRGB(x, y, findClosestColor(new Color(image.getRGB(x, y)), paletteForDithering).getRGB());
                return q;
        }
    }

    BufferedImage floydSteinbergDitherProcess(BufferedImage image, Color[] targetPalette, double ditherLevelParam) {
        int w = image.getWidth(), h = image.getHeight();
        float dF = (float)ditherLevelParam;
        float[] eR = new float[w], eG = new float[w], eB = new float[w];
        float[] nER = new float[w], nEG = new float[w], nEB = new float[w];
        for (int y = 0; y < h; y++) {
            Arrays.fill(nER, 0f); Arrays.fill(nEG, 0f); Arrays.fill(nEB, 0f);
            float pER = 0, pEG = 0, pEB = 0;
            for (int x = 0; x < w; x++) {
                Color oC = new Color(image.getRGB(x, y));
                int oR = clamp(oC.getRed() + (int)(eR[x] + pER));
                int oG = clamp(oC.getGreen() + (int)(eG[x] + pEG));
                int oB = clamp(oC.getBlue() + (int)(eB[x] + pEB));
                Color cC = new Color(oR, oG, oB);
                Color clC = findClosestColor(cC, targetPalette);
                image.setRGB(x, y, clC.getRGB());
                float errR = (oR - clC.getRed()) * dF;
                float errG = (oG - clC.getGreen()) * dF;
                float errB = (oB - clC.getBlue()) * dF;
                pER = errR * 7f/16f; pEG = errG * 7f/16f; pEB = errB * 7f/16f;
                if (x > 0) { nER[x-1] += errR * 3f/16f; nEG[x-1] += errG * 3f/16f; nEB[x-1] += errB * 3f/16f; }
                nER[x] += errR * 5f/16f; nEG[x] += errG * 5f/16f; nEB[x] += errB * 5f/16f;
                if (x < w-1) { nER[x+1] += errR * 1f/16f; nEG[x+1] += errG * 1f/16f; nEB[x+1] += errB * 1f/16f; }
            }
            System.arraycopy(nER, 0, eR, 0, w);
            System.arraycopy(nEG, 0, eG, 0, w);
            System.arraycopy(nEB, 0, eB, 0, w);
        }
        return image;
    }

    BufferedImage atkinsonDitherProcess(BufferedImage image, Color[] targetPalette, double ditherLevelParam) {
        int w = image.getWidth(), h = image.getHeight();
        float dF = (float)ditherLevelParam;
        float[] eR = new float[w+2], eG = new float[w+2], eB = new float[w+2];
        float[] nER = new float[w+2], nEG = new float[w+2], nEB = new float[w+2];
        float[] nnER = new float[w+2], nnEG = new float[w+2], nnEB = new float[w+2];
        int idx;
        for (int y = 0; y < h; y++) {
            System.arraycopy(nER, 0, eR, 0, w+2);
            System.arraycopy(nEG, 0, eG, 0, w+2);
            System.arraycopy(nEB, 0, eB, 0, w+2);
            System.arraycopy(nnER, 0, nER, 0, w+2);
            System.arraycopy(nnEG, 0, nEG, 0, w+2);
            System.arraycopy(nnEB, 0, nEB, 0, w+2);
            Arrays.fill(nnER, 0f); Arrays.fill(nnEG, 0f); Arrays.fill(nnEB, 0f);
            for (int x = 0; x < w; x++) {
                idx = x+1;
                Color oC = new Color(image.getRGB(x, y));
                int oR = clamp(oC.getRed() + (int)eR[idx]);
                int oG = clamp(oC.getGreen() + (int)eG[idx]);
                int oB = clamp(oC.getBlue() + (int)eB[idx]);
                Color cC = new Color(oR, oG, oB);
                Color clC = findClosestColor(cC, targetPalette);
                image.setRGB(x, y, clC.getRGB());
                float errR = (oR - clC.getRed()) * dF/8f;
                float errG = (oG - clC.getGreen()) * dF/8f;
                float errB = (oB - clC.getBlue()) * dF/8f;
                eR[idx+1] += errR;
                eG[idx+1] += errG;
                eB[idx+1] += errB;
                if (idx+2 < eR.length) {
                    eR[idx+2] += errR;
                    eG[idx+2] += errG;
                    eB[idx+2] += errB;
                }
                nER[idx-1] += errR;
                nEG[idx-1] += errG;
                nEB[idx-1] += errB;
                nER[idx] += errR;
                nEG[idx] += errG;
                nEB[idx] += errB;
                nER[idx+1] += errR;
                nEG[idx+1] += errG;
                nEB[idx+1] += errB;
                nnER[idx] += errR;
                nnEG[idx] += errG;
                nnEB[idx] += errB;
            }
        }
        return image;
    }

    BufferedImage jjnDitherProcess(BufferedImage image, Color[] targetPalette, double ditherLevelParam) {
        int w = image.getWidth(), h = image.getHeight();
        float dF = (float)ditherLevelParam;
        float[] eR = new float[w+4], eG = new float[w+4], eB = new float[w+4];
        float[] nER = new float[w+4], nEG = new float[w+4], nEB = new float[w+4];
        float[] nnER = new float[w+4], nnEG = new float[w+4], nnEB = new float[w+4];
        int idx;
        for (int y = 0; y < h; y++) {
            System.arraycopy(nER, 0, eR, 0, w+4);
            System.arraycopy(nEG, 0, eG, 0, w+4);
            System.arraycopy(nEB, 0, eB, 0, w+4);
            System.arraycopy(nnER, 0, nER, 0, w+4);
            System.arraycopy(nnEG, 0, nEG, 0, w+4);
            System.arraycopy(nnEB, 0, nEB, 0, w+4);
            Arrays.fill(nnER, 0f); Arrays.fill(nnEG, 0f); Arrays.fill(nnEB, 0f);
            for (int x = 0; x < w; x++) {
                idx = x+2;
                Color oC = new Color(image.getRGB(x, y));
                int oR = clamp(oC.getRed() + (int)eR[idx]);
                int oG = clamp(oC.getGreen() + (int)eG[idx]);
                int oB = clamp(oC.getBlue() + (int)eB[idx]);
                Color cC = new Color(oR, oG, oB);
                Color clC = findClosestColor(cC, targetPalette);
                image.setRGB(x, y, clC.getRGB());
                float errR = (oR - clC.getRed()) * dF/48f;
                float errG = (oG - clC.getGreen()) * dF/48f;
                float errB = (oB - clC.getBlue()) * dF/48f;
                eR[idx+1] += errR*7f;
                eG[idx+1] += errG*7f;
                eB[idx+1] += errB*7f;
                eR[idx+2] += errR*5f;
                eG[idx+2] += errG*5f;
                eB[idx+2] += errB*5f;
                nER[idx-2] += errR*3f;
                nEG[idx-2] += errG*3f;
                nEB[idx-2] += errB*3f;
                nER[idx-1] += errR*5f;
                nEG[idx-1] += errG*5f;
                nEB[idx-1] += errB*5f;
                nER[idx] += errR*7f;
                nEG[idx] += errG*7f;
                nEB[idx] += errB*7f;
                nER[idx+1] += errR*5f;
                nEG[idx+1] += errG*5f;
                nEB[idx+1] += errB*5f;
                nER[idx+2] += errR*3f;
                nEG[idx+2] += errG*3f;
                nEB[idx+2] += errB*3f;
                nnER[idx-2] += errR*1f;
                nnEG[idx-2] += errG*1f;
                nnEB[idx-2] += errB*1f;
                nnER[idx-1] += errR*3f;
                nnEG[idx-1] += errG*3f;
                nnEB[idx-1] += errB*3f;
                nnER[idx] += errR*5f;
                nnEG[idx] += errG*5f;
                nnEB[idx] += errB*5f;
                nnER[idx+1] += errR*3f;
                nnEG[idx+1] += errG*3f;
                nnEB[idx+1] += errB*3f;
                nnER[idx+2] += errR*1f;
                nnEG[idx+2] += errG*1f;
                nnEB[idx+2] += errB*1f;
            }
        }
        return image;
    }

    int clamp(float value) {
        return Math.max(0, Math.min(255, (int)(value + 0.5f)));
    }
    int clamp(int value) {
        return Math.max(0, Math.min(255, value));
    }

    BufferedImage bayerDitherProcess(BufferedImage image, int requestedN, Color[] targetPalette, double ditherLevelParam) {
        int width = image.getWidth(), height = image.getHeight();
        BufferedImage outputImage = new BufferedImage(width, height, BufferedImage.TYPE_INT_RGB);
        int[][] bayerMatrix = getBayerMatrix(requestedN);
        int actualN = bayerMatrix.length;
        float ditherFactor = (float)ditherLevelParam;
        float thresholdDivisor = (float)(actualN * actualN);
        for (int y = 0; y < height; y++) {
            for (int x = 0; x < width; x++) {
                Color originalColor = new Color(image.getRGB(x, y));
                float threshold = (bayerMatrix[x % actualN][y % actualN] / thresholdDivisor) * 255f * ditherFactor;
                int r = clamp(originalColor.getRed() + (int)(threshold - (127.5f*ditherFactor)));
                int g = clamp(originalColor.getGreen() + (int)(threshold - (127.5f*ditherFactor)));
                int b = clamp(originalColor.getBlue() + (int)(threshold - (127.5f*ditherFactor)));
                outputImage.setRGB(x, y, findClosestColor(new Color(r, g, b), targetPalette).getRGB());
            }
        }
        return outputImage;
    }

    BufferedImage halftoneDitherProcess(BufferedImage image, Color[] targetPalette, double ditherLevelParam) {
        int width = image.getWidth(), height = image.getHeight();
        BufferedImage outputImage = new BufferedImage(width, height, BufferedImage.TYPE_INT_RGB);
        float ditherFactor = (float)ditherLevelParam;
        for (int y = 0; y < height; y++) {
            for (int x = 0; x < width; x++) {
                Color originalColor = new Color(image.getRGB(x, y));
                float thresholdOffset = ((x+y)%2==0) ? (128f*ditherFactor) : (-128f*ditherFactor);
                int r = clamp(originalColor.getRed() + (int)thresholdOffset);
                int g = clamp(originalColor.getGreen() + (int)thresholdOffset);
                int b = clamp(originalColor.getBlue() + (int)thresholdOffset);
                outputImage.setRGB(x, y, findClosestColor(new Color(r, g, b), targetPalette).getRGB());
            }
        }
        return outputImage;
    }

    int[][] getBayerMatrix(int N) {
        if (N == 2) return new int[][] { {0,2}, {3,1} };
        if (N < 2 || N > 8 || (N & (N-1)) != 0) {
            IJ.log("Warning: Bayer matrix size " + N + " not supported. Using 2x2.");
            return new int[][] { {0,2}, {3,1} };
        }
        int[][] smallerMatrix = getBayerMatrix(N/2);
        int halfN = N/2;
        int[][] matrix = new int[N][N];
        for (int y = 0; y < halfN; y++) {
            for (int x = 0; x < halfN; x++) {
                int val = smallerMatrix[x][y];
                matrix[x][y] = 4 * val;
                matrix[x+halfN][y] = 4 * val + 2;
                matrix[x][y+halfN] = 4 * val + 3;
                matrix[x+halfN][y+halfN] = 4 * val + 1;
            }
        }
        return matrix;
    }

    BufferedImage convertToZXSpectrum(BufferedImage adjustedImage, BufferedImage ditheredImage,
                                        int blockWidth, int blockHeight, ColorMode cMode, boolean allowBrightFlag,
                                        double brightThresh, Color[] ditherPalette) {
        int width = ditheredImage.getWidth(), height = ditheredImage.getHeight();
        BufferedImage zxImage = new BufferedImage(width, height, BufferedImage.TYPE_INT_RGB);
        if (blockWidth == 1 && blockHeight == 1) {
            Graphics2D g = zxImage.createGraphics();
            g.drawImage(ditheredImage, 0, 0, null);
            g.dispose();
            return zxImage;
        }
        for (int yStart = 0; yStart < height; yStart += blockHeight) {
            for (int xStart = 0; xStart < width; xStart += blockWidth) {
                processBlock(adjustedImage, ditheredImage, zxImage,
                        xStart, yStart, blockWidth, blockHeight, cMode, allowBrightFlag, brightThresh, ditherPalette);
            }
        }
        return zxImage;
    }

    // --- processBlock (used for non-interlaced modes) ---
    void processBlock(BufferedImage adjustedImage, BufferedImage ditheredImage, BufferedImage outputImage,
                      int startX, int startY, int blockWidth, int blockHeight, ColorMode cMode,
                      boolean allowBrightFlag, double brightThresh, Color[] ditherPalette) {
        int endX = Math.min(startX + blockWidth, ditheredImage.getWidth());
        int endY = Math.min(startY + blockHeight, ditheredImage.getHeight());
        boolean useBrightAttribute = false;
        boolean brightModeActive = (cMode == ColorMode.ZX_BRIGHT_ATTRIBUTE) ||
                                    (cMode == ColorMode.USER_DEFINED && allowBrightFlag);
        if (brightModeActive) {
            double totalIntensity = 0; int pixelCount = 0;
            for (int y = startY; y < endY; y++) {
                for (int x = startX; x < endX; x++) {
                    Color adjColor = new Color(adjustedImage.getRGB(x, y));
                    totalIntensity += (adjColor.getRed() + adjColor.getGreen() + adjColor.getBlue()) / 3.0;
                    pixelCount++;
                }
            }
            if (pixelCount > 0 && (totalIntensity/pixelCount) >= brightThresh)
                useBrightAttribute = true;
        }
        Map<Color, Integer> colorCounts = new HashMap<>();
        for (int y = startY; y < endY; y++) {
            for (int x = startX; x < endX; x++) {
                Color ditheredPixelColor = new Color(ditheredImage.getRGB(x, y));
                Color closest = findClosestColor(ditheredPixelColor, ditherPalette);
                colorCounts.put(closest, colorCounts.getOrDefault(closest,0)+1);
            }
        }
        Color baseInk = (ditherPalette.length > 0) ? ditherPalette[0] : Color.BLACK;
        Color basePaper = (ditherPalette.length > 1) ? ditherPalette[1] : Color.WHITE;
        if (!colorCounts.isEmpty()) {
            java.util.List<Map.Entry<Color, Integer>> entryList =
                    new java.util.ArrayList<>(colorCounts.entrySet());
            entryList.sort((e1, e2) -> e2.getValue().compareTo(e1.getValue()));
            baseInk = entryList.get(0).getKey();
            if (entryList.size() > 1) {
                basePaper = entryList.get(1).getKey();
                if (basePaper.equals(baseInk))
                    basePaper = findClosestDifferentPaletteColor(baseInk, ditherPalette);
            } else {
                basePaper = findClosestDifferentPaletteColor(baseInk, ditherPalette);
            }
        }
        Color finalInk = baseInk, finalPaper = basePaper;
        if (useBrightAttribute) {
            Color normalInk = findClosestColor(baseInk, zxPaletteNormal);
            Color normalPaper = findClosestColor(basePaper, zxPaletteNormal);
            finalInk = getBrightColor(normalInk);
            finalPaper = getBrightColor(normalPaper);
            if (finalPaper.equals(finalInk))
                finalPaper = findClosestDifferentPaletteColor(finalInk, zxPaletteBright);
        }
        for (int y = startY; y < endY; y++) {
            for (int x = startX; x < endX; x++) {
                Color ditheredPixelColor = new Color(ditheredImage.getRGB(x, y));
                Color closest = findClosestColor(ditheredPixelColor, ditherPalette);
                double distInk = colorDistance(closest, baseInk);
                double distPaper = colorDistance(closest, basePaper);
                outputImage.setRGB(x, y, (distInk <= distPaper) ? finalInk.getRGB() : finalPaper.getRGB());
            }
        }
    }

    // --- NEW Interlaced Dithering Mode Implementation ---
    /**
     * Revised Interlaced Dither Process.
     * For each block (of size defined by Block Size), we:
     * 1. Compute the block average color.
     * 2. Use findBestPalettePair to select two distinct colors (ink and paper) from the extended ZX palette.
     * 3. Compute luminance values and a target fraction f such that:
     *      f = (L_paper - L_target) / (L_paper - L_ink)
     *    (if L_paper equals L_ink, f is set to 0.5)
     * 4. Compute a normalized Bayer matrix (ordered dither) for the block.
     * 5. For each pixel in the block, let T be the dither threshold (0–1).
     *    - In frame A, assign ink if T < f, otherwise paper.
     *    - In frame B, assign ink if (1 – T) < f, otherwise paper.
     * 6. Then average frame A and frame B pixel‐by‐pixel.
     */
    BufferedImage interlacedDitherProcess(BufferedImage image, int blockWidth, int blockHeight) {
        IJ.log("Interlace Mode: Using block size: " + blockWidth + "x" + blockHeight);
        int width = image.getWidth(), height = image.getHeight();
        BufferedImage frameA = new BufferedImage(width, height, BufferedImage.TYPE_INT_RGB);
        BufferedImage frameB = new BufferedImage(width, height, BufferedImage.TYPE_INT_RGB);
        
        // Process each block
        for (int by = 0; by < height; by += blockHeight) {
            for (int bx = 0; bx < width; bx += blockWidth) {
                int endX = Math.min(bx + blockWidth, width);
                int endY = Math.min(by + blockHeight, height);
                // Compute block average color
                long sumR = 0, sumG = 0, sumB = 0; int count = 0;
                for (int y = by; y < endY; y++) {
                    for (int x = bx; x < endX; x++) {
                        Color c = new Color(image.getRGB(x, y));
                        sumR += c.getRed(); sumG += c.getGreen(); sumB += c.getBlue();
                        count++;
                    }
                }
                int avgR = (int)(sumR / count);
                int avgG = (int)(sumG / count);
                int avgB = (int)(sumB / count);
                Color blockAvg = new Color(avgR, avgG, avgB);
                // Get best pair of distinct colors from extended palette
                ColorPair bestPair = findBestPalettePair(blockAvg);
                if (bestPair == null) {
                    bestPair = new ColorPair(zxPaletteNormal[0], zxPaletteBright[1]);
                }
                // Compute luminance values
                double L_target = luminance(blockAvg);
                double L_ink = luminance(bestPair.color1);
                double L_paper = luminance(bestPair.color2);
                double f; 
                if (Math.abs(L_paper - L_ink) < 1e-3) f = 0.5;
                else f = (L_paper - L_target) / (L_paper - L_ink);
                f = Math.max(0, Math.min(1, f));
                // For debugging, log the pair and fraction
                IJ.log("Block (" + bx + "," + by + ") average " + blockAvg +
                        " -> Pair: " + bestPair.color1 + " (L=" + L_ink + ") & " + bestPair.color2 +
                        " (L=" + L_paper + "), f=" + f);
                // Get a normalized Bayer matrix for this block.
                float[][] bayer = getNormalizedBayerMatrix(blockWidth, blockHeight);
                int matrixRows = bayer.length;
                int matrixCols = bayer[0].length;
                // Process each pixel in block with ordered dither
                for (int y = by; y < endY; y++) {
                    for (int x = bx; x < endX; x++) {
                        int dx = x - bx, dy = y - by;
                        // Wrap into the Bayer matrix dimensions
                        float T = bayer[dy % matrixRows][dx % matrixCols]; // in [0,1]
                        // For frame A: use dither threshold T vs. f
                        Color colorA = (T < f) ? bestPair.color1 : bestPair.color2;
                        // For frame B: use the complementary threshold (1 - T) vs. f
                        Color colorB = ((1 - T) < f) ? bestPair.color1 : bestPair.color2;
                        frameA.setRGB(x, y, colorA.getRGB());
                        frameB.setRGB(x, y, colorB.getRGB());
                    }
                }
            }
        }
        // Now average frame A and frame B pixelwise
        BufferedImage avgImage = new BufferedImage(width, height, BufferedImage.TYPE_INT_RGB);
        for (int y = 0; y < height; y++) {
            for (int x = 0; x < width; x++) {
                Color a = new Color(frameA.getRGB(x, y));
                Color b = new Color(frameB.getRGB(x, y));
                int r = clamp((a.getRed() + b.getRed()) / 2);
                int g = clamp((a.getGreen() + b.getGreen()) / 2);
                int bVal = clamp((a.getBlue() + b.getBlue()) / 2);
                avgImage.setRGB(x, y, new Color(r, g, bVal).getRGB());
            }
        }
        return avgImage;
    }

    /**
     * Helper: Returns a normalized Bayer matrix of size N x N,
     * where N is the maximum of blockWidth and blockHeight.
     * Values are in the range [0,1].
     */
    private float[][] getNormalizedBayerMatrix(int blockWidth, int blockHeight) {
        int N = Math.max(blockWidth, blockHeight);
        int[][] raw = getBayerMatrix(N);
        float[][] norm = new float[N][N];
        int maxVal = N * N;
        for (int i = 0; i < N; i++) {
            for (int j = 0; j < N; j++) {
                norm[i][j] = raw[i][j] / (float)(maxVal - 1);
            }
        }
        return norm;
    }

    /**
     * Helper: Computes relative luminance for a color.
     * Uses standard Rec. 601 weights.
     */
    private double luminance(Color c) {
        return 0.299 * c.getRed() + 0.587 * c.getGreen() + 0.114 * c.getBlue();
    }

    /**
     * Helper class to hold a pair of colors.
     */
    private class ColorPair {
        Color color1, color2;
        ColorPair(Color c1, Color c2) { this.color1 = c1; this.color2 = c2; }
    }

    /**
     * Finds the best pair of distinct colors from the extended palette (normal and bright ZX palettes)
     * such that the average color of the pair is closest to the target.
     * Pairs where the two colors are identical are skipped.
     */
    private ColorPair findBestPalettePair(Color target) {
        ColorPair bestPair = null;
        double bestDistance = Double.MAX_VALUE;
        java.util.List<Color> extendedPalette = new java.util.ArrayList<>();
        for (Color c : zxPaletteNormal) { extendedPalette.add(c); }
        for (Color c : zxPaletteBright) { extendedPalette.add(c); }
        int n = extendedPalette.size();
        for (int i = 0; i < n; i++) {
            for (int j = i+1; j < n; j++) {
                Color c1 = extendedPalette.get(i);
                Color c2 = extendedPalette.get(j);
                if (c1.equals(c2)) continue; // force distinct colors
                int avgR = (c1.getRed() + c2.getRed())/2;
                int avgG = (c1.getGreen() + c2.getGreen())/2;
                int avgB = (c1.getBlue() + c2.getBlue())/2;
                Color avgColor = new Color(avgR, avgG, avgB);
                double distance = colorDistance(avgColor, target);
                if (distance < bestDistance) {
                    bestDistance = distance;
                    bestPair = new ColorPair(c1, c2);
                }
            }
        }
        return bestPair;
    }

    Color getBrightColor(Color normalColor) {
        if (normalColor == null) return Color.BLACK;
        for (int i = 0; i < zxPaletteNormal.length; i++) {
            if (zxPaletteNormal[i].equals(normalColor))
                return (i==0)? zxPaletteNormal[0] : zxPaletteBright[i];
        }
        return normalColor;
    }

    Color findClosestDifferentPaletteColor(Color inputColor, Color[] targetPalette) {
        Color closest = null; double minDistance = Double.MAX_VALUE;
        boolean foundDifferent = false;
        if (targetPalette == null || targetPalette.length < 2)
            return inputColor;
        for (Color paletteColor : targetPalette) {
            if (paletteColor.equals(inputColor)) continue;
            foundDifferent = true;
            double distance = colorDistance(inputColor, paletteColor);
            if (distance < minDistance) { minDistance = distance; closest = paletteColor; }
        }
        return foundDifferent ? closest : inputColor;
    }

    double colorDistance(Color c1, Color c2) {
        long dr = c1.getRed() - c2.getRed();
        long dg = c1.getGreen() - c2.getGreen();
        long db = c1.getBlue() - c2.getBlue();
        return Math.sqrt(dr*dr + dg*dg + db*db);
    }

    Color findClosestColor(Color input, Color[] targetPalette) {
        if (targetPalette == null || targetPalette.length == 0)
            return Color.BLACK;
        Color closest = targetPalette[0];
        double minDistance = Double.MAX_VALUE;
        for (Color paletteColor : targetPalette) {
            double distance = colorDistance(input, paletteColor);
            if (distance < minDistance) { minDistance = distance; closest = paletteColor; }
            if (minDistance == 0)
                break;
        }
        return closest;
    }

    // --- Palette Loading ---
    boolean loadPaletteFromFile(String filePath) {
        java.util.List<Color> loadedPalette = new java.util.ArrayList<>();
        try (BufferedReader br = new BufferedReader(new FileReader(filePath))) {
            String line; int lineNum = 0;
            while ((line = br.readLine()) != null) {
                lineNum++; line = line.trim();
                if (line.isEmpty() || line.startsWith("#") || line.startsWith(";"))
                    continue;
                String[] values = line.split("[,\\s]+");
                if (values.length == 3) {
                    try {
                        int r = clamp(Integer.parseInt(values[0].trim()));
                        int g = clamp(Integer.parseInt(values[1].trim()));
                        int b = clamp(Integer.parseInt(values[2].trim()));
                        loadedPalette.add(new Color(r, g, b));
                    } catch (NumberFormatException nfe) {
                        IJ.log("Warning: Invalid number format on line " + lineNum + ": " + line);
                    }
                } else {
                    IJ.log("Warning: Skipping malformed line " + lineNum + ": " + line);
                }
            }
            if (!loadedPalette.isEmpty()) {
                this.customPalette = loadedPalette.toArray(new Color[0]);
                IJ.log("Loaded " + this.customPalette.length + " colors from " + new File(filePath).getName());
                return true;
            } else {
                IJ.error("Palette Loading", "No valid colors found in file.");
                this.customPalette = null;
                return false;
            }
        } catch (IOException ex) {
            IJ.error("Palette Loading Error", "Error reading file:\n" + ex.getMessage());
            this.customPalette = null;
            return false;
        }
    }

    // --- Helper Methods for Active Palette ---
    public Color[] getActivePalette() {
        switch (this.colorMode) {
            case ZX_NORMAL: return zxPaletteNormal;
            case ZX_BRIGHT_ATTRIBUTE: return zxPaletteNormal;
            case ZX_INTERLACED_NB: return zxPaletteNormal;
            case C64: return c64Palette;
            case EGA: return egaPalette;
            case BLACK_AND_WHITE: return bwPalette;
            case BLACK_RED_GREEN_WHITE: return brgwPalette;
            case USER_DEFINED: return generateUserPaletteFromFields();
            case CUSTOM: return (this.customPalette != null && this.customPalette.length > 0) ? this.customPalette : zxPaletteNormal;
            default: return zxPaletteNormal;
        }
    }
    Color[] generateUserPaletteFromFields() {
        LinkedHashSet<Color> paletteSet = new LinkedHashSet<>();
        boolean[] selections = getUserDefinedFlags();
        for (int i = 0; i < 8; i++) {
            if (selections[i])
                paletteSet.add(zxPaletteNormal[i]);
        }
        if (paletteSet.isEmpty()) {
            IJ.log("Warning: User Defined palette has no colors selected. Defaulting to B&W.");
            return bwPalette;
        }
        return paletteSet.toArray(new Color[0]);
    }
    boolean[] getUserDefinedFlags() {
        return new boolean[]{userUseBlack, userUseBlue, userUseRed, userUseMagenta,
                             userUseGreen, userUseCyan, userUseYellow, userUseWhite, userAllowBright};
    }
    void setUserDefinedFlags(boolean[] flags) {
        if (flags == null || flags.length < 9)
            return;
        userUseBlack = flags[0];
        userUseBlue = flags[1];
        userUseRed = flags[2];
        userUseMagenta = flags[3];
        userUseGreen = flags[4];
        userUseCyan = flags[5];
        userUseYellow = flags[6];
        userUseWhite = flags[7];
        userAllowBright = flags[8];
    }

    int getBayerSizeFromIndex(int index) {
        switch (index) {
            case 0: return 2;
            case 1: return 4;
            case 2: return 8;
            default:
                IJ.log("Warning: Invalid Bayer index " + index + ". Defaulting to size 4.");
                return 4;
        }
    }
    String colorToName(Color c) {
        if (c == null)
            return "null";
        return String.format("RGB(%d,%d,%d)", c.getRed(), c.getGreen(), c.getBlue());
    }

    BufferedImage averageImages(BufferedImage imgA, BufferedImage imgB) {
        int width = imgA.getWidth(), height = imgA.getHeight();
        if (width != imgB.getWidth() || height != imgB.getHeight()) {
            IJ.log("Error: Cannot average images of different sizes.");
            return imgA;
        }
        BufferedImage avgImage = new BufferedImage(width, height, BufferedImage.TYPE_INT_RGB);
        int[] pixelsA = ((DataBufferInt) imgA.getRaster().getDataBuffer()).getData();
        int[] pixelsB = ((DataBufferInt) imgB.getRaster().getDataBuffer()).getData();
        int[] pixelsAvg = ((DataBufferInt) avgImage.getRaster().getDataBuffer()).getData();
        for (int i = 0; i < pixelsA.length; i++) {
            int rgbA = pixelsA[i], rgbB = pixelsB[i];
            int rA = (rgbA >> 16) & 0xff, gA = (rgbA >> 8) & 0xff, bA = rgbA & 0xff;
            int rB = (rgbB >> 16) & 0xff, gB = (rgbB >> 8) & 0xff, bB = rgbB & 0xff;
            int avgR = clamp((rA + rB) / 2);
            int avgG = clamp((gA + gB) / 2);
            int avgB = clamp((bA + bB) / 2);
            pixelsAvg[i] = (avgR << 16) | (avgG << 8) | avgB;
        }
        return avgImage;
    }

    private void updateComponentVisibility() {
        if (colorModeChoice == null || userDefinedPanel == null)
            return;
        ColorMode selectedMode = ColorMode.fromString(colorModeChoice.getSelectedItem());
        boolean showUserDefined = (selectedMode == ColorMode.USER_DEFINED);
        if (userDefinedPanel.isVisible() != showUserDefined) {
            userDefinedPanel.setVisible(showUserDefined);
            pack(); validate();
        }
    }

    // --- Inner Classes ---
    private class PreviewWorker extends SwingWorker<ImageProcessor, Void> {
        private final PreviewParameters params;
        private Exception error = null;
        PreviewWorker(PreviewParameters params) { this.params = params; }
        @Override
        protected ImageProcessor doInBackground() throws Exception {
            IJ.log("PreviewWorker: doInBackground START (Worker Hash: " + this.hashCode() + ")");
            IJ.showStatus("Processing preview...");
            ImageProcessor ip = params.sourceProcessor.duplicate();
            ImageProcessor resultIp = null;
            try {
                BufferedImage bufferedImage = ip.getBufferedImage();
                BufferedImage adjustedImage = applyBCG(bufferedImage, params.brightness, params.contrast, params.gamma);
                if (isCancelled()) { IJ.log("PreviewWorker cancelled before Dithering/Conversion."); return null; }
                BufferedImage finalZxImage;
                if (params.colorMode == ColorMode.ZX_INTERLACED_NB) {
                    IJ.log("Worker: Processing Interlaced...");
                    finalZxImage = interlacedDitherProcess(adjustedImage, params.blockSizeX, params.blockSizeY);
                    IJ.log("Worker: Interlace processing complete.");
                } else {
                    BufferedImage ditheredImage = applyDithering(adjustedImage, params.ditheringMode, params.activeDitherPalette, params.ditheringLevel);
                    if (isCancelled()) { IJ.log("PreviewWorker cancelled before block conversion."); return null; }
                    finalZxImage = convertToZXSpectrum(adjustedImage, ditheredImage, params.blockSizeX, params.blockSizeY,
                            params.colorMode, params.userFlags[8], params.brightAttributeThreshold, params.activeDitherPalette);
                }
                resultIp = new ColorProcessor(finalZxImage);
                IJ.log("PreviewWorker: Core processing complete.");
            } catch (Exception e) {
                IJ.log("!!! EXCEPTION in PreviewWorker.doInBackground !!!");
                e.printStackTrace();
                throw e;
            } finally {
                IJ.log("PreviewWorker: doInBackground FINISHED (Worker Hash: " + this.hashCode() + ")");
            }
            IJ.showStatus("Preview ready.");
            return resultIp;
        }
        @Override
        protected void done() {
            IJ.log("PreviewWorker: done() method entered. Worker Hash: " + this.hashCode() +
                   ", Is current: " + (this == currentWorker));
            if (this != currentWorker) { IJ.log("Preview update skipped (worker outdated). Hash: " + this.hashCode()); return; }
            try {
                if (isCancelled()) { IJ.log("Preview task completion ignored (cancelled). Hash: " + this.hashCode()); return; }
                ImageProcessor resultIp = get();
                if (resultIp != null && previewImp != null && previewCanvas != null) {
                    previewImp.setProcessor(resultIp);
                    previewImp.updateAndDraw();
                    previewCanvas.repaint();
                    if (imagePanel != null) imagePanel.validate();
                    paletteCanvas.repaint();
                } else { IJ.log("PreviewWorker: ResultIp or UI components null. Cannot update preview."); }
            } catch (Exception e) {
                error = e;
                if (this == currentWorker) {
                    IJ.log("!!! Error during background preview processing task !!! Hash: " + this.hashCode());
                    if (e instanceof CancellationException) { IJ.log("(Cancelled before get())"); }
                    else { e.printStackTrace(); IJ.error("Preview Error", "Error retrieving preview result:\n" + e.getMessage()); }
                } else {
                    IJ.log("Error from outdated worker ignored: " + e.getClass().getSimpleName() + " Hash: " + this.hashCode());
                }
            } finally { if (currentWorker == this) { currentWorker = null; } }
        }
    } // End PreviewWorker class

    private static class PreviewParameters {
        final ImageProcessor sourceProcessor;
        final int blockSizeX, blockSizeY;
        final DitheringMode ditheringMode;
        final ColorMode colorMode;
        final Color[] activeDitherPalette;
        final Color[] customPalette;
        final boolean[] userFlags;
        final double ditheringLevel, brightness, contrast, gamma, brightAttributeThreshold;
        PreviewParameters(ImageProcessor sourceProcessor, int blockSizeX, int blockSizeY,
                          DitheringMode ditheringMode, ColorMode colorMode, Color[] activeDitherPalette,
                          Color[] customPalette, boolean[] userFlags,
                          double ditheringLevel, double brightness, double contrast, double gamma,
                          double brightAttributeThreshold) {
            this.sourceProcessor = sourceProcessor;
            this.blockSizeX = blockSizeX;
            this.blockSizeY = blockSizeY;
            this.ditheringMode = ditheringMode;
            this.colorMode = colorMode;
            this.activeDitherPalette = activeDitherPalette;
            this.customPalette = customPalette;
            this.userFlags = userFlags;
            this.ditheringLevel = ditheringLevel;
            this.brightness = brightness;
            this.contrast = contrast;
            this.gamma = gamma;
            this.brightAttributeThreshold = brightAttributeThreshold;
        }
    }

} // End of ZX_Spectrum_Converter6 class
