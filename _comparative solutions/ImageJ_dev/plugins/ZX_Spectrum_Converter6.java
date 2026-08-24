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
import java.util.List;
import java.util.ArrayList;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.CancellationException;
import javax.swing.*;
import javax.swing.filechooser.FileNameExtensionFilter;
import java.awt.image.BufferedImage;
import java.awt.image.Raster;
import java.awt.image.WritableRaster;
import java.awt.image.RescaleOp;
import java.awt.image.LookupTable;
import java.awt.image.LookupOp;
import java.awt.image.ShortLookupTable;
import java.awt.image.DataBufferInt;

/**
 * ZX Spectrum Converter6
 * Version: ZX_Spectrum_Converter6 (Corrected Duplicates & Order - FINAL FINAL Attempt!)
 * Changes:
 * - Removed duplicate averageColors method.
 * - Ensured Bayer constants defined ONCE before methods using them.
 * - Ensured getBayerMatrix defined ONCE after constants and before its usage.
 * - Ensured clamp methods defined ONCE before use.
 * - (Includes previous fixes)
 */
public class ZX_Spectrum_Converter6 extends PlugInFrame
        implements ActionListener, ItemListener, AdjustmentListener, FocusListener, TextListener {

    // --- Enums for Modes ---
    private enum DitheringMode { FLOYD_STEINBERG("Floyd-Steinberg"), ATKINSON("Atkinson"), JARVIS_JUDICE_NINKE("Jarvis, Judice, Ninke"), HALFTONE("Halftone"), BAYER_2X2("Bayer 2x2"), BAYER_4X4("Bayer 4x4"), BAYER_8X8("Bayer 8x8"); private final String label; DitheringMode(String label) { this.label = label; } @Override public String toString() { return label; } public static String[] getLabels() { return Arrays.stream(DitheringMode.values()).map(DitheringMode::toString).toArray(String[]::new); } public static DitheringMode fromString(String text) { for (DitheringMode mode : DitheringMode.values()) { if (mode.label.equalsIgnoreCase(text)) return mode; } return FLOYD_STEINBERG; } public int getBayerSize() { switch (this) { case BAYER_2X2: return 2; case BAYER_4X4: return 4; case BAYER_8X8: return 8; default: return 0; } } public boolean isErrorDiffusion() { return this == FLOYD_STEINBERG || this == ATKINSON || this == JARVIS_JUDICE_NINKE; } }
    private enum ColorMode { ZX_NORMAL("ZX Spectrum (Normal)"), ZX_BRIGHT_ATTRIBUTE("ZX Spectrum (Bright Attribute)"), C64("Commodore 64"), EGA("EGA (16 Color)"), BLACK_AND_WHITE("Black and White"), BLACK_RED_GREEN_WHITE("Black/Red/Green/White"), USER_DEFINED("User Defined Subset"), CUSTOM("Custom (External File)"); private final String label; ColorMode(String label) { this.label = label; } @Override public String toString() { return label; } public static String[] getLabels() { return Arrays.stream(ColorMode.values()).map(ColorMode::toString).toArray(String[]::new); } public static ColorMode fromString(String text) { for (ColorMode mode : ColorMode.values()) { if (mode.label.equalsIgnoreCase(text)) return mode; } return ZX_NORMAL; } }
    private enum BrightMode { OFF, ALLOWED, FORCED }
    private static class UserColorSelection { final java.util.List<Integer> indexes; final BrightMode brightMode; UserColorSelection(java.util.List<Integer> indexes, BrightMode brightMode) { this.indexes = (indexes != null) ? indexes : new java.util.ArrayList<>(); this.brightMode = (brightMode != null) ? brightMode : BrightMode.OFF; } static UserColorSelection empty() { return new UserColorSelection(new java.util.ArrayList<>(), BrightMode.OFF); } String toUIText() { StringBuilder sb = new StringBuilder(); for (int i = 0; i < indexes.size(); i++) { sb.append(indexes.get(i)); if (i < indexes.size() - 1) sb.append(","); } if (brightMode == BrightMode.ALLOWED) sb.append("b"); else if (brightMode == BrightMode.FORCED) sb.append("B"); return sb.toString(); } @Override public String toString() { return "Indexes: " + indexes + ", Bright: " + brightMode; } }

    // --- Palettes ---
    private final Color[] zxPaletteNormal = { new Color(0, 0, 0), new Color(0, 0, 192), new Color(192, 0, 0), new Color(192, 0, 192), new Color(0, 192, 0), new Color(0, 192, 192), new Color(192, 192, 0), new Color(192, 192, 192) };
    private final Color[] zxPaletteBright = { new Color(0, 0, 0), new Color(0, 0, 255), new Color(255, 0, 0), new Color(255, 0, 255), new Color(0, 255, 0), new Color(0, 255, 255), new Color(255, 255, 0), new Color(255, 255, 255) };
    private final Color[] c64Palette = { new Color(0,0,0),new Color(255,255,255),new Color(136,0,0),new Color(170,255,238),new Color(204,68,204),new Color(0,204,85),new Color(0,0,170),new Color(238,238,119),new Color(221,136,85),new Color(102,68,0),new Color(255,119,119),new Color(51,51,51),new Color(119,119,119),new Color(170,255,102),new Color(0,119,221),new Color(187,187,187) };
    private final Color[] egaPalette = { new Color(0,0,0),new Color(0,0,170),new Color(0,170,0),new Color(0,170,170),new Color(170,0,0),new Color(170,0,170),new Color(170,85,0),new Color(170,170,170),new Color(85,85,85),new Color(85,85,255),new Color(85,255,85),new Color(85,255,255),new Color(255,85,85),new Color(255,85,255),new Color(255,255,85),new Color(255,255,255) };
    private final Color[] bwPalette = { new Color(0, 0, 0), new Color(255, 255, 255) };
    private final Color[] brgwPalette = { new Color(0, 0, 0), new Color(255, 0, 0), new Color(0, 255, 0), new Color(255, 255, 255) };

    // --- Bayer Matrix constants (DEFINED ONCE HERE) ---
    private static final int[][] BAYER_MATRIX_2X2 = { {0,2}, {3,1} };
    private static final int[][] BAYER_MATRIX_4X4 = { {0,8,2,10}, {12,4,14,6}, {3,11,1,9}, {15,7,13,5} };
    private static final int[][] BAYER_MATRIX_8X8 = {
        { 0,32, 8,40, 2,34,10,42}, {48,16,56,24,50,18,58,26}, {12,44, 4,36,14,46, 6,38}, {60,28,52,20,62,30,54,22},
        { 3,35,11,43, 1,33, 9,41}, {51,19,59,27,49,17,57,25}, {15,47, 7,39,13,45, 5,37}, {63,31,55,23,61,29,53,21} };
    // --- End Bayer Matrix constants ---

    // --- Plugin Parameters ---
    private ImagePlus sourceImp; private ImagePlus previewImp; private int blockSizeX = 8; private int blockSizeY = 8; private double ditheringLevel = 1.0; private double brightness = 1.0; private double contrast = 1.0; private double gamma = 1.0; private DitheringMode ditheringMode = DitheringMode.FLOYD_STEINBERG; private ColorMode colorMode = ColorMode.ZX_NORMAL; private Color[] customPalette = null; private String paletteFilePath = ""; private double brightAttributeThreshold = 150.0; private boolean isInterlaceEnabled = false; private UserColorSelection paperASelection = new UserColorSelection(Arrays.asList(0), BrightMode.OFF); private UserColorSelection inkASelection = new UserColorSelection(Arrays.asList(7), BrightMode.OFF); private UserColorSelection paperBSelection = new UserColorSelection(Arrays.asList(0), BrightMode.OFF); private UserColorSelection inkBSelection = new UserColorSelection(Arrays.asList(6), BrightMode.OFF); private double currentMagnification = 1.0;

    // --- UI Components ---
    private Panel controlPanel, displayPanel, imagePanel, scalePanel; private ImageCanvas sourceCanvas, previewCanvas; private PalettePreviewCanvas paletteCanvas; private Panel userDefinedPanel; private TextField blockSizeXField, blockSizeYField; private Label blockSizeXLabel, blockSizeYLabel; private Checkbox interlaceCheckbox; private Label paperALabel, inkALabel, paperBLabel, inkBLabel; private TextField paperAField, inkAField, paperBField, inkBField; private Choice ditherModeChoice, colorModeChoice; private Scrollbar ditherScroll, brightScroll, contrastScroll, gammaScroll; private Button loadPaletteButton, applyButton; private CheckboxGroup scaleGroup; private Checkbox scale1x, scale2x, scale3x;

    // --- Concurrency ---
    private PreviewWorker currentWorker = null;

    // --- Custom Canvas for Palette Preview ---
    private class PalettePreviewCanvas extends Canvas { private static final int PREF_HEIGHT = 20; PalettePreviewCanvas() { setPreferredSize(new Dimension(200, PREF_HEIGHT)); } @Override public void paint(Graphics g) { Color[] currentPalette = getActivePalette(); if (currentPalette == null || currentPalette.length == 0) { g.setColor(Color.GRAY); g.fillRect(0, 0, getWidth(), getHeight()); g.setColor(Color.BLACK); g.drawString("No Palette", 5, getHeight()-5); return; } int w = getWidth(), h = getHeight(); int blockW = Math.max(1, w / currentPalette.length); for (int i = 0; i < currentPalette.length; i++) { g.setColor(currentPalette[i]); int x = i * blockW; int curW = (i == currentPalette.length - 1) ? (w - x) : blockW; g.fillRect(x, 0, curW, h); } } @Override public Dimension getPreferredSize() { return new Dimension(200, PREF_HEIGHT); } @Override public Dimension getMinimumSize() { return getPreferredSize(); } }

    // --- Constructor ---
    public ZX_Spectrum_Converter6() { super("ZX Spectrum Converter6"); }

    // --- PlugInFrame Entry Point ---
    @Override public void run(String arg) { sourceImp = WindowManager.getCurrentImage(); if (sourceImp == null) { IJ.noImage(); return; } if (sourceImp.getType() != ImagePlus.COLOR_RGB) { IJ.error(getTitle(), "Plugin requires an RGB image."); return; } String frameTitle = "ZX Spectrum Converter6" + " [" + sourceImp.getID() + "]"; Frame existingFrame = WindowManager.getFrame(frameTitle); if (existingFrame != null) { existingFrame.toFront(); return; } setTitle(frameTitle); setupUI(); pack(); GUI.center(this); setVisible(true); if (readBlockSizeUISettings()){ triggerPreviewUpdate(); } else { IJ.error("Initial block size invalid. Please correct."); } }

    // --- UI Setup Method ---
    private void setupUI() { setLayout(new BorderLayout(5,5)); controlPanel = new Panel(); GridBagLayout gbl = new GridBagLayout(); GridBagConstraints gbc = new GridBagConstraints(); controlPanel.setLayout(gbl); Insets weightyDefaults = new Insets(2,5,2,5); int gridY = 0; gbc.gridwidth = 1; gbc.fill = GridBagConstraints.NONE; gbc.anchor = GridBagConstraints.EAST; gbc.insets = weightyDefaults; blockSizeXLabel = new Label("Block Size X:"); gbc.gridx = 0; gbc.gridy = gridY; controlPanel.add(blockSizeXLabel, gbc); blockSizeXField = new TextField(String.valueOf(blockSizeX), 3); blockSizeXField.addActionListener(this); blockSizeXField.addFocusListener(this); blockSizeXField.addTextListener(this); gbc.gridx = 1; gbc.anchor = GridBagConstraints.WEST; gbc.fill = GridBagConstraints.HORIZONTAL; controlPanel.add(blockSizeXField, gbc); gridY++; blockSizeYLabel = new Label("Block Size Y:"); gbc.gridx = 0; gbc.gridy = gridY; gbc.fill = GridBagConstraints.NONE; gbc.anchor = GridBagConstraints.EAST; controlPanel.add(blockSizeYLabel, gbc); blockSizeYField = new TextField(String.valueOf(blockSizeY), 3); blockSizeYField.addActionListener(this); blockSizeYField.addFocusListener(this); blockSizeYField.addTextListener(this); gbc.gridx = 1; gbc.anchor = GridBagConstraints.WEST; gbc.fill = GridBagConstraints.HORIZONTAL; controlPanel.add(blockSizeYField, gbc); gridY++; gbc.gridx = 0; gbc.gridy = gridY; gbc.anchor = GridBagConstraints.EAST; gbc.fill = GridBagConstraints.NONE; controlPanel.add(new Label("Interlace:"), gbc); gbc.gridx = 1; gbc.anchor = GridBagConstraints.WEST; interlaceCheckbox = new Checkbox("Enabled", isInterlaceEnabled); interlaceCheckbox.addItemListener(this); controlPanel.add(interlaceCheckbox, gbc); gridY++; gbc.gridx = 0; gbc.gridy = gridY; gbc.anchor = GridBagConstraints.EAST; gbc.fill = GridBagConstraints.NONE; controlPanel.add(new Label("Dithering:"), gbc); gbc.gridx = 1; gbc.anchor = GridBagConstraints.WEST; gbc.fill = GridBagConstraints.HORIZONTAL; ditherModeChoice = new Choice(); for (String s : DitheringMode.getLabels()) ditherModeChoice.add(s); ditherModeChoice.select(ditheringMode.toString()); ditherModeChoice.addItemListener(this); controlPanel.add(ditherModeChoice, gbc); gridY++; gbc.gridx = 0; gbc.gridy = gridY; gbc.anchor = GridBagConstraints.EAST; gbc.fill = GridBagConstraints.NONE; controlPanel.add(new Label("Color Mode:"), gbc); gbc.gridx = 1; gbc.anchor = GridBagConstraints.WEST; gbc.fill = GridBagConstraints.HORIZONTAL; colorModeChoice = new Choice(); for (String s : ColorMode.getLabels()) colorModeChoice.add(s); colorModeChoice.select(colorMode.toString()); colorModeChoice.addItemListener(this); controlPanel.add(colorModeChoice, gbc); gridY++; userDefinedPanel = new Panel(); GridBagLayout userGbl = new GridBagLayout(); GridBagConstraints userGbc = new GridBagConstraints(); userDefinedPanel.setLayout(userGbl); userGbc.insets = new Insets(1, 3, 1, 3); userGbc.anchor = GridBagConstraints.WEST; int userGridY = 0; userGbc.gridx = 0; userGbc.gridy = userGridY; userGbc.gridwidth = 2; userDefinedPanel.add(new Label("User Defined Palette Colors (Indexes 0-7, use 'b'/'B'):"), userGbc); userGridY++; userGbc.gridwidth = 1; paperALabel = new Label("Paper A:"); userGbc.gridx = 0; userGbc.gridy = userGridY; userGbc.fill = GridBagConstraints.NONE; userDefinedPanel.add(paperALabel, userGbc); paperAField = new TextField(paperASelection.toUIText(), 15); paperAField.addTextListener(this); paperAField.addFocusListener(this); userGbc.gridx = 1; userGbc.gridy = userGridY; userGbc.fill = GridBagConstraints.HORIZONTAL; userDefinedPanel.add(paperAField, userGbc); userGridY++; inkALabel = new Label("Ink A:"); userGbc.gridx = 0; userGbc.gridy = userGridY; userGbc.fill = GridBagConstraints.NONE; userDefinedPanel.add(inkALabel, userGbc); inkAField = new TextField(inkASelection.toUIText(), 15); inkAField.addTextListener(this); inkAField.addFocusListener(this); userGbc.gridx = 1; userGbc.gridy = userGridY; userGbc.fill = GridBagConstraints.HORIZONTAL; userDefinedPanel.add(inkAField, userGbc); userGridY++; paperBLabel = new Label("Paper B:"); userGbc.gridx = 0; userGbc.gridy = userGridY; userGbc.fill = GridBagConstraints.NONE; userDefinedPanel.add(paperBLabel, userGbc); paperBField = new TextField(paperBSelection.toUIText(), 15); paperBField.addTextListener(this); paperBField.addFocusListener(this); userGbc.gridx = 1; userGbc.gridy = userGridY; userGbc.fill = GridBagConstraints.HORIZONTAL; userDefinedPanel.add(paperBField, userGbc); userGridY++; inkBLabel = new Label("Ink B:"); userGbc.gridx = 0; userGbc.gridy = userGridY; userGbc.fill = GridBagConstraints.NONE; userDefinedPanel.add(inkBLabel, userGbc); inkBField = new TextField(inkBSelection.toUIText(), 15); inkBField.addTextListener(this); inkBField.addFocusListener(this); userGbc.gridx = 1; userGbc.gridy = userGridY; userGbc.fill = GridBagConstraints.HORIZONTAL; userDefinedPanel.add(inkBField, userGbc); gbc.gridx = 0; gbc.gridy = gridY; gbc.gridwidth = 2; gbc.anchor = GridBagConstraints.NORTHWEST; gbc.fill = GridBagConstraints.HORIZONTAL; gbc.insets = new Insets(10, 5, 0, 5); controlPanel.add(userDefinedPanel, gbc); gridY++; gbc.gridwidth = 1; gbc.insets = weightyDefaults; ditherScroll = addSlider(controlPanel, "Dither Level:", 0, 100, (int)(ditheringLevel * 100), gbc, gridY++); brightScroll = addSlider(controlPanel, "Brightness:", 0, 200, (int)(brightness * 100), gbc, gridY++); contrastScroll = addSlider(controlPanel, "Contrast:", 0, 200, (int)(contrast * 100), gbc, gridY++); gammaScroll = addSlider(controlPanel, "Gamma:", 1, 300, (int)(gamma * 100), gbc, gridY++); gbc.gridx = 0; gbc.gridy = gridY; gbc.gridwidth = 2; gbc.anchor = GridBagConstraints.CENTER; gbc.fill = GridBagConstraints.NONE; gbc.insets = new Insets(10,5,2,5); Panel buttonRow = new Panel(new FlowLayout()); loadPaletteButton = new Button("Load Custom Palette"); loadPaletteButton.addActionListener(this); applyButton = new Button("Apply to Original"); applyButton.addActionListener(this); buttonRow.add(loadPaletteButton); buttonRow.add(applyButton); controlPanel.add(buttonRow, gbc); gridY++; Panel controlWrapperPanel = new Panel(new BorderLayout()); controlWrapperPanel.add(controlPanel, BorderLayout.NORTH); add(controlWrapperPanel, BorderLayout.WEST); displayPanel = new Panel(new BorderLayout(5,5)); imagePanel = new Panel(new java.awt.GridLayout(1,2,5,5)); sourceCanvas = new ImageCanvas(sourceImp); ImageProcessor blankIp = sourceImp.getProcessor().createProcessor(sourceImp.getWidth(), sourceImp.getHeight()); previewImp = new ImagePlus("Preview", blankIp); previewCanvas = new ImageCanvas(previewImp); imagePanel.add(sourceCanvas); imagePanel.add(previewCanvas); displayPanel.add(imagePanel, BorderLayout.CENTER); scalePanel = new Panel(new FlowLayout(FlowLayout.CENTER)); scaleGroup = new CheckboxGroup(); scale1x = new Checkbox("1x", scaleGroup, true); scale1x.addItemListener(this); scale2x = new Checkbox("2x", scaleGroup, false); scale2x.addItemListener(this); scale3x = new Checkbox("3x", scaleGroup, false); scale3x.addItemListener(this); scalePanel.add(new Label("Zoom:")); scalePanel.add(scale1x); scalePanel.add(scale2x); scalePanel.add(scale3x); displayPanel.add(scalePanel, BorderLayout.NORTH); add(displayPanel, BorderLayout.CENTER); paletteCanvas = new PalettePreviewCanvas(); add(paletteCanvas, BorderLayout.SOUTH); updateComponentVisibility(); addWindowListener(new WindowAdapter() { @Override public void windowClosing(WindowEvent e) { close(); if (currentWorker != null) { currentWorker.cancel(true); currentWorker = null; } } }); }

    // --- Helper for adding a Slider ---
    private Scrollbar addSlider(Panel p, String label, int min, int max, int value, GridBagConstraints gbc, int y) { gbc.gridx = 0; gbc.gridy = y; gbc.anchor = GridBagConstraints.EAST; gbc.fill = GridBagConstraints.NONE; p.add(new Label(label), gbc); gbc.gridx = 1; gbc.anchor = GridBagConstraints.WEST; gbc.fill = GridBagConstraints.HORIZONTAL; gbc.weightx = 1.0; Scrollbar sb = new Scrollbar(Scrollbar.HORIZONTAL, value, 1, min, max+1); sb.addAdjustmentListener(this); p.add(sb, gbc); gbc.weightx = 0.0; return sb; }

    // --- Event Handlers ---
    @Override public void actionPerformed(ActionEvent e) { Object source = e.getSource(); if (source == loadPaletteButton) { loadPaletteAction(); } else if (source == applyButton) { applyChangesAction(); } else if (source == blockSizeXField || source == blockSizeYField) { if (readBlockSizeUISettings()) { triggerPreviewUpdate(); } } }

    // --- Merged itemStateChanged with ORIGINAL Zoom Logic ---
    @Override public void itemStateChanged(ItemEvent e) {
        Object source = e.getSource();
        if (source == scale1x || source == scale2x || source == scale3x) {
            updateMagnification();
            triggerPreviewUpdate();
        } else {
            if (source == colorModeChoice || source == interlaceCheckbox) {
                updateComponentVisibility();
            }
             triggerPreviewUpdate();
        }
    }
    // --- END Merged itemStateChanged ---

    @Override public void adjustmentValueChanged(AdjustmentEvent e) { triggerPreviewUpdate(); }
    @Override public void focusGained(FocusEvent e) { /* Do nothing */ }
    @Override public void focusLost(FocusEvent e) { Object source = e.getSource(); boolean needsUpdate = false; if (source == blockSizeXField || source == blockSizeYField) { needsUpdate = readBlockSizeUISettings(); } else if (source == paperAField || source == inkAField || source == paperBField || source == inkBField) { readUISettings(); needsUpdate = true; } if (needsUpdate) { triggerPreviewUpdate(); } }
    @Override public void textValueChanged(TextEvent e) { /* Do nothing */ }

    // --- Actions ---
    private void loadPaletteAction() { IJ.log("Load Palette button clicked."); JFileChooser fileChooser = new JFileChooser(paletteFilePath); FileNameExtensionFilter filter = new FileNameExtensionFilter("Palette Files (*.pal, *.txt, *.csv)", "pal", "txt", "csv"); fileChooser.setFileFilter(filter); int returnVal = fileChooser.showOpenDialog(this); if (returnVal == JFileChooser.APPROVE_OPTION) { File file = fileChooser.getSelectedFile(); paletteFilePath = file.getAbsolutePath(); boolean loaded = loadPaletteFromFile(paletteFilePath); if (loaded) { IJ.log("Palette loaded successfully, setting mode to Custom and updating preview."); colorModeChoice.select(ColorMode.CUSTOM.toString()); updateComponentVisibility(); triggerPreviewUpdate(); } } else { IJ.log("Load Palette canceled."); } }
    private void applyChangesAction() { IJ.log("Apply button clicked."); if (sourceImp == null) return; if (!readBlockSizeUISettings()) { IJ.error("Cannot apply changes. Invalid block size detected."); return; } readUISettings(); IJ.log(String.format("ApplyAction: Block=%dx%d Interlace=%b Dither=%s Color=%s DLevel=%.2f BCG=%.1f/%.1f/%.1f", this.blockSizeX, this.blockSizeY, this.isInterlaceEnabled, this.ditheringMode, this.colorMode, this.ditheringLevel, this.brightness, this.contrast, this.gamma)); if (this.colorMode == ColorMode.USER_DEFINED) { IJ.log(" Apply User Defined: PaperA=" + paperASelection + " InkA=" + inkASelection + (isInterlaceEnabled ? (" PaperB=" + paperBSelection + " InkB=" + inkBSelection) : "")); } Color[] applyPalette = getActivePalette(); ImageProcessor ipToProcess = sourceImp.getProcessor(); ImageProcessor backupIp = ipToProcess.duplicate(); try { IJ.showStatus("Applying ZX Spectrum Conversion..."); processImage(ipToProcess, this.blockSizeX, this.blockSizeY, this.isInterlaceEnabled, this.ditheringMode, this.colorMode, applyPalette, this.customPalette, this.paperASelection, this.inkASelection, this.paperBSelection, this.inkBSelection, this.ditheringLevel, this.brightness, this.contrast, this.gamma, this.brightAttributeThreshold); sourceImp.updateAndDraw(); IJ.showStatus("Applied ZX Spectrum Conversion."); } catch (Exception e) { IJ.error("Error applying changes: " + e.getMessage()); sourceImp.setProcessor(backupIp); sourceImp.updateAndDraw(); IJ.showStatus("Error applying changes. Original restored."); e.printStackTrace(); } }

    /** Reads and validates Block Size X and Y from the UI TextFields. */
    private boolean readBlockSizeUISettings() { int oldX = blockSizeX; int oldY = blockSizeY; int newX = oldX; int newY = oldY; boolean xValid = true; boolean yValid = true; try { newX = Integer.parseInt(blockSizeXField.getText()); if (newX < 1) { IJ.log("Warning: Block Size X must be >= 1. Reverting to " + oldX); blockSizeXField.setText(String.valueOf(oldX)); newX = oldX; xValid = false; } } catch (NumberFormatException e) { IJ.log("Warning: Invalid number for Block Size X. Reverting to " + oldX); blockSizeXField.setText(String.valueOf(oldX)); newX = oldX; xValid = false; } try { newY = Integer.parseInt(blockSizeYField.getText()); if (newY < 1) { IJ.log("Warning: Block Size Y must be >= 1. Reverting to " + oldY); blockSizeYField.setText(String.valueOf(oldY)); newY = oldY; yValid = false; } } catch (NumberFormatException e) { IJ.log("Warning: Invalid number for Block Size Y. Reverting to " + oldY); blockSizeYField.setText(String.valueOf(oldY)); newY = oldY; yValid = false; } blockSizeX = newX; blockSizeY = newY; return xValid && yValid; }

    /** Reads all UI settings into member variables. Assumes block size is already validated. */
    private void readUISettings() { ditheringMode = DitheringMode.fromString(ditherModeChoice.getSelectedItem()); colorMode = ColorMode.fromString(colorModeChoice.getSelectedItem()); isInterlaceEnabled = interlaceCheckbox.getState(); if (colorMode == ColorMode.USER_DEFINED) { paperASelection = parseUserDefinedColors(paperAField.getText()); inkASelection = parseUserDefinedColors(inkAField.getText()); if (isInterlaceEnabled) { paperBSelection = parseUserDefinedColors(paperBField.getText()); inkBSelection = parseUserDefinedColors(inkBField.getText()); } else { paperBSelection = UserColorSelection.empty(); inkBSelection = UserColorSelection.empty(); } } else { paperASelection = UserColorSelection.empty(); inkASelection = UserColorSelection.empty(); paperBSelection = UserColorSelection.empty(); inkBSelection = UserColorSelection.empty(); } ditheringLevel = ditherScroll.getValue() / 100.0; brightness = brightScroll.getValue() / 100.0; contrast = contrastScroll.getValue() / 100.0; gamma = Math.max(0.01, gammaScroll.getValue() / 100.0); if (this.colorMode == ColorMode.CUSTOM && (this.customPalette == null || this.customPalette.length == 0)) { if (!paletteFilePath.isEmpty()) { IJ.log("Warning: Custom mode selected but no valid palette loaded. Reverting to ZX_NORMAL."); this.colorMode = ColorMode.ZX_NORMAL; colorModeChoice.select(ColorMode.ZX_NORMAL.toString()); updateComponentVisibility(); paletteFilePath = ""; } } }

    /** Parses the user input string for color indexes and bright mode flags. */
    private UserColorSelection parseUserDefinedColors(String text) { java.util.List<Integer> indexes = new java.util.ArrayList<>(); BrightMode brightMode = BrightMode.OFF; boolean foundB_lower = false; boolean foundB_upper = false; if (text != null && !text.trim().isEmpty()) { if (text.contains("B")) { foundB_upper = true; } else if (text.contains("b")) { foundB_lower = true; } String cleanText = text; if (foundB_upper) cleanText = cleanText.replace('B', ','); if (foundB_lower) cleanText = cleanText.replace('b', ','); String[] parts = cleanText.replaceAll("[^0-7,]", "").split(","); for (String part : parts) { part = part.trim(); if (!part.isEmpty()) { try { int index = Integer.parseInt(part); if (index >= 0 && index <= 7) { indexes.add(index); } } catch (NumberFormatException e) { } } } } if (foundB_upper) brightMode = BrightMode.FORCED; else if (foundB_lower) brightMode = BrightMode.ALLOWED; java.util.List<Integer> uniqueIndexes = new java.util.ArrayList<>(new LinkedHashSet<>(indexes)); return new UserColorSelection(uniqueIndexes, brightMode); }

     /** Determines the effective BrightMode for a block based on Paper and Ink selections. */
    private BrightMode determineBlockBrightMode(UserColorSelection paperSelection, UserColorSelection inkSelection) { if (paperSelection.brightMode == BrightMode.FORCED || inkSelection.brightMode == BrightMode.FORCED) { return BrightMode.FORCED; } else if (paperSelection.brightMode == BrightMode.ALLOWED || inkSelection.brightMode == BrightMode.ALLOWED) { return BrightMode.ALLOWED; } else { return BrightMode.OFF; } }

    // --- ORIGINAL updateMagnification from ZX_Spectrum_Converter6 (copy).txt ---
    private void updateMagnification() {
        if (sourceCanvas == null || previewCanvas == null || scaleGroup == null ||
            controlPanel == null || displayPanel == null || paletteCanvas == null ||
            imagePanel == null || sourceImp == null) return;
        Checkbox selected = scaleGroup.getSelectedCheckbox();
        double newMag = 1.0;
        if (selected == scale2x) newMag = 2.0;
        else if (selected == scale3x) newMag = 3.0;
        if (newMag != currentMagnification) {
            IJ.log("Setting Magnification from " + currentMagnification + " to " + newMag);
            sourceCanvas.setMagnification(newMag); previewCanvas.setMagnification(newMag);
            currentMagnification = newMag;
            int newCanvasWidth = (int)(sourceImp.getWidth()*newMag); int newCanvasHeight = (int)(sourceImp.getHeight()*newMag);
            Dimension newSize = new Dimension(newCanvasWidth, newCanvasHeight);
            sourceCanvas.setPreferredSize(newSize); sourceCanvas.setSize(newSize);
            previewCanvas.setPreferredSize(newSize); previewCanvas.setSize(newSize);
            sourceCanvas.revalidate(); previewCanvas.revalidate(); imagePanel.revalidate(); displayPanel.revalidate();
            this.pack();
            sourceCanvas.repaint(); previewCanvas.repaint(); imagePanel.repaint();
        }
    }
    // --- END ORIGINAL updateMagnification ---

    // --- Trigger Preview Update ---
    private void triggerPreviewUpdate() { if (sourceImp == null || previewImp == null || !isVisible()) { return; } if (!readBlockSizeUISettings()) { IJ.log("Preview update skipped due to invalid block size."); ImageProcessor errorIp = previewImp.getProcessor(); if (errorIp != null) { errorIp.setColor(Color.RED); errorIp.fill(); errorIp.setColor(Color.WHITE); errorIp.drawString("Invalid Block Size!", 10, 20); previewImp.updateAndDraw(); } return; } readUISettings(); Color[] ditherPal = getActivePalette(); if (colorMode == ColorMode.USER_DEFINED) { ditherPal = zxPaletteNormal; if (paperASelection.indexes.isEmpty() && inkASelection.indexes.isEmpty()) { ditherPal = bwPalette; } } else if (colorMode == ColorMode.CUSTOM) { ditherPal = this.customPalette; if (ditherPal == null || ditherPal.length == 0) { ditherPal = bwPalette; } } PreviewParameters params = new PreviewParameters( sourceImp.getProcessor(), blockSizeX, blockSizeY, ditheringMode, colorMode, ditherPal, customPalette, ditheringLevel, brightness, contrast, gamma, brightAttributeThreshold, isInterlaceEnabled, paperASelection, inkASelection, paperBSelection, inkBSelection ); if (currentWorker != null && !currentWorker.isDone()) { IJ.log("Cancelling previous preview worker (Hash: " + currentWorker.hashCode() + ")"); currentWorker.cancel(true); } IJ.log("Starting new preview worker..."); currentWorker = new PreviewWorker(params); currentWorker.execute(); }

    // --- clamp methods (DEFINED ONCE HERE) ---
    int clamp(float value) { return Math.max(0, Math.min(255, (int)(value + 0.5f))); }
    int clamp(int value) { return Math.max(0, Math.min(255, value)); }
    // --- END clamp ---

    // --- BCG Methods ---
    BufferedImage applyBCG(BufferedImage img, double brightnessParam, double contrastParam, double gammaParam) { float cF=(float)contrastParam;float off=(float)(128.0*(1.0-cF)+255.0*(brightnessParam-1.0));RescaleOp rO=new RescaleOp(cF,off,null);BufferedImage cBI=rO.filter(img,null);if(Math.abs(gammaParam-1.0)>1e-6){LookupTable lT=createGammaLookupTable(gammaParam);LookupOp gO=new LookupOp(lT,null);return gO.filter(cBI,null);}else{return cBI;} }
    LookupTable createGammaLookupTable(double ga) { if(ga<=0)ga=0.01;short[] gL=new short[256];double exp=1.0/ga;for(int i=0;i<256;i++)gL[i]=(short)Math.min(255,(int)(255.0*Math.pow(i/255.0,exp)+0.5));short[][] lD=new short[3][256];for(int i=0;i<3;i++)System.arraycopy(gL,0,lD[i],0,256);return new ShortLookupTable(0,lD); }

    // --- Bayer Matrix method (DEFINED ONCE HERE) ---
    int[][] getBayerMatrix(int N) {
        switch (N) {
            case 2: return BAYER_MATRIX_2X2;
            case 4: return BAYER_MATRIX_4X4;
            case 8: return BAYER_MATRIX_8X8;
            default:
                IJ.log("Warning: Bayer matrix size " + N + " invalid. Using 4x4.");
                return BAYER_MATRIX_4X4;
        }
     }
    // --- End Bayer ---

    // --- Dithering Dispatch ---
    BufferedImage applyDithering(BufferedImage image, DitheringMode mode, Color[] paletteForDithering, double level) {
         if (paletteForDithering == null || paletteForDithering.length == 0) { IJ.log("Warning: applyDithering palette empty. Using B&W."); paletteForDithering = bwPalette; }
         if (level <= 0) mode = null; int width = image.getWidth(), height = image.getHeight();
         BufferedImage ditheredImage = new BufferedImage(width, height, BufferedImage.TYPE_INT_RGB); Graphics2D g2d = ditheredImage.createGraphics(); g2d.drawImage(image, 0, 0, null); g2d.dispose();
         DitheringMode effectiveMode = (mode != null) ? mode : DitheringMode.FLOYD_STEINBERG;

        switch (effectiveMode) {
            case FLOYD_STEINBERG:       if (level <=0) break; return floydSteinbergDitherProcess(ditheredImage, paletteForDithering, level);
            case ATKINSON:              if (level <=0) break; return atkinsonDitherProcess(ditheredImage, paletteForDithering, level);
            case JARVIS_JUDICE_NINKE:   if (level <=0) break; return jjnDitherProcess(ditheredImage, paletteForDithering, level);
            case BAYER_2X2: case BAYER_4X4: case BAYER_8X8: if (level <=0) break; return bayerDitherProcess(ditheredImage, effectiveMode.getBayerSize(), paletteForDithering, level);
            case HALFTONE:              if (level <=0) break; return halftoneDitherProcess(ditheredImage, paletteForDithering, level);
            default: break;
        }
         IJ.log("applyDithering: Quantizing only (Mode=" + mode + ", Level=" + level + ")."); BufferedImage q = new BufferedImage(width, height, BufferedImage.TYPE_INT_RGB);
         for (int y = 0; y < height; y++) { for (int x = 0; x < width; x++) { q.setRGB(x, y, findClosestColor(new Color(image.getRGB(x, y)), paletteForDithering).getRGB()); } } return q;
    }

    // --- Specific Dithering Algorithms ---
    BufferedImage floydSteinbergDitherProcess(BufferedImage image, Color[] targetPalette, double ditherLevelParam) { int w=image.getWidth(),h=image.getHeight();float dF=(float)ditherLevelParam;float[] eR=new float[w],eG=new float[w],eB=new float[w],nER=new float[w],nEG=new float[w],nEB=new float[w];for(int y=0;y<h;y++){Arrays.fill(nER,0f);Arrays.fill(nEG,0f);Arrays.fill(nEB,0f);float pER=0,pEG=0,pEB=0;for(int x=0;x<w;x++){Color oC=new Color(image.getRGB(x,y));int oR=clamp(oC.getRed()+(int)(eR[x]+pER+0.5f));int oG=clamp(oC.getGreen()+(int)(eG[x]+pEG+0.5f));int oB=clamp(oC.getBlue()+(int)(eB[x]+pEB+0.5f));Color clC=findClosestColor(new Color(oR,oG,oB),targetPalette);image.setRGB(x,y,clC.getRGB());float errR=(oR-clC.getRed())*dF;float errG=(oG-clC.getGreen())*dF;float errB=(oB-clC.getBlue())*dF;pER=errR*7f/16f;pEG=errG*7f/16f;pEB=errB*7f/16f;if(x>0){nER[x-1]+=errR*3f/16f;nEG[x-1]+=errG*3f/16f;nEB[x-1]+=errB*3f/16f;}nER[x]+=errR*5f/16f;nEG[x]+=errG*5f/16f;nEB[x]+=errB*5f/16f;if(x<w-1){nER[x+1]+=errR*1f/16f;nEG[x+1]+=errG*1f/16f;nEB[x+1]+=errB*1f/16f;}}System.arraycopy(nER,0,eR,0,w);System.arraycopy(nEG,0,eG,0,w);System.arraycopy(nEB,0,eB,0,w);}return image;}
    BufferedImage atkinsonDitherProcess(BufferedImage image, Color[] targetPalette, double ditherLevelParam) { int w=image.getWidth(),h=image.getHeight();float dF=(float)ditherLevelParam/8.0f;float[] eR=new float[w+2],eG=new float[w+2],eB=new float[w+2],nER=new float[w+2],nEG=new float[w+2],nEB=new float[w+2],nnER=new float[w+2],nnEG=new float[w+2],nnEB=new float[w+2];for(int y=0;y<h;y++){System.arraycopy(nER,0,eR,0,w+2);System.arraycopy(nEG,0,eG,0,w+2);System.arraycopy(nEB,0,eB,0,w+2);System.arraycopy(nnER,0,nER,0,w+2);System.arraycopy(nnEG,0,nEG,0,w+2);System.arraycopy(nnEB,0,nEB,0,w+2);Arrays.fill(nnER,0f);Arrays.fill(nnEG,0f);Arrays.fill(nnEB,0f);int idx;for(int x=0;x<w;x++){idx=x+1;Color oC=new Color(image.getRGB(x,y));int oR=clamp(oC.getRed()+(int)(eR[idx]+0.5f));int oG=clamp(oC.getGreen()+(int)(eG[idx]+0.5f));int oB=clamp(oC.getBlue()+(int)(eB[idx]+0.5f));Color clC=findClosestColor(new Color(oR,oG,oB),targetPalette);image.setRGB(x,y,clC.getRGB());float errR=(oR-clC.getRed())*dF;float errG=(oG-clC.getGreen())*dF;float errB=(oB-clC.getBlue())*dF;if(idx+1<eR.length){eR[idx+1]+=errR;eG[idx+1]+=errG;eB[idx+1]+=errB;}if(idx+2<eR.length){eR[idx+2]+=errR;eG[idx+2]+=errG;eB[idx+2]+=errB;}if(idx-1>=0){nER[idx-1]+=errR;nEG[idx-1]+=errG;nEB[idx-1]+=errB;}nER[idx]+=errR;nEG[idx]+=errG;nEB[idx]+=errB;if(idx+1<nER.length){nER[idx+1]+=errR;nEG[idx+1]+=errG;nEB[idx+1]+=errB;}nnER[idx]+=errR;nnEG[idx]+=errG;nnEB[idx]+=errB;}}return image;}
    BufferedImage jjnDitherProcess(BufferedImage image, Color[] targetPalette, double ditherLevelParam) { int w=image.getWidth(),h=image.getHeight();float dF=(float)ditherLevelParam/48.0f;float[] eR=new float[w+4],eG=new float[w+4],eB=new float[w+4],nER=new float[w+4],nEG=new float[w+4],nEB=new float[w+4],nnER=new float[w+4],nnEG=new float[w+4],nnEB=new float[w+4];for(int y=0;y<h;y++){System.arraycopy(nER,0,eR,0,w+4);System.arraycopy(nEG,0,eG,0,w+4);System.arraycopy(nEB,0,eB,0,w+4);System.arraycopy(nnER,0,nER,0,w+4);System.arraycopy(nnEG,0,nEG,0,w+4);System.arraycopy(nnEB,0,nEB,0,w+4);Arrays.fill(nnER,0f);Arrays.fill(nnEG,0f);Arrays.fill(nnEB,0f);int idx;for(int x=0;x<w;x++){idx=x+2;Color oC=new Color(image.getRGB(x,y));int oR=clamp(oC.getRed()+(int)(eR[idx]+0.5f));int oG=clamp(oC.getGreen()+(int)(eG[idx]+0.5f));int oB=clamp(oC.getBlue()+(int)(eB[idx]+0.5f));Color clC=findClosestColor(new Color(oR,oG,oB),targetPalette);image.setRGB(x,y,clC.getRGB());float errR=(oR-clC.getRed())*dF;float errG=(oG-clC.getGreen())*dF;float errB=(oB-clC.getBlue())*dF;if(idx+1<eR.length){eR[idx+1]+=errR*7f;eG[idx+1]+=errG*7f;eB[idx+1]+=errB*7f;}if(idx+2<eR.length){eR[idx+2]+=errR*5f;eG[idx+2]+=errG*5f;eB[idx+2]+=errB*5f;}if(idx-2>=0){nER[idx-2]+=errR*3f;nEG[idx-2]+=errG*3f;nEB[idx-2]+=errB*3f;}if(idx-1>=0){nER[idx-1]+=errR*5f;nEG[idx-1]+=errG*5f;nEB[idx-1]+=errB*5f;}nER[idx]+=errR*7f;nEG[idx]+=errG*7f;nEB[idx]+=errB*7f;if(idx+1<nER.length){nER[idx+1]+=errR*5f;nEG[idx+1]+=errG*5f;nEB[idx+1]+=errB*5f;}if(idx+2<nER.length){nER[idx+2]+=errR*3f;nEG[idx+2]+=errG*3f;nEB[idx+2]+=errB*3f;}if(idx-2>=0){nnER[idx-2]+=errR*1f;nnEG[idx-2]+=errG*1f;nnEB[idx-2]+=errB*1f;}if(idx-1>=0){nnER[idx-1]+=errR*3f;nnEG[idx-1]+=errG*3f;nnEB[idx-1]+=errB*3f;}nnER[idx]+=errR*5f;nnEG[idx]+=errG*5f;nnEB[idx]+=errB*5f;if(idx+1<nnER.length){nnER[idx+1]+=errR*3f;nnEG[idx+1]+=errG*3f;nnEB[idx+1]+=errB*3f;}if(idx+2<nnER.length){nnER[idx+2]+=errR*1f;nnEG[idx+2]+=errG*1f;nnEB[idx+2]+=errB*1f;}}}return image;}
    BufferedImage bayerDitherProcess(BufferedImage image, int requestedN, Color[] targetPalette, double ditherLevelParam) { int width=image.getWidth(),height=image.getHeight();BufferedImage outputImage=new BufferedImage(width,height,BufferedImage.TYPE_INT_RGB);int[][] bayerMatrix=getBayerMatrix(requestedN);int actualN=bayerMatrix.length;float ditherFactor=(float)ditherLevelParam;float thresholdDivisor=(float)(actualN*actualN);for(int y=0;y<height;y++){for(int x=0;x<width;x++){Color originalColor=new Color(image.getRGB(x,y));float threshold=(bayerMatrix[y%actualN][x%actualN]/thresholdDivisor)*255f*ditherFactor;int r=clamp(originalColor.getRed()+(int)(threshold-(127.5f*ditherFactor)+0.5f));int g=clamp(originalColor.getGreen()+(int)(threshold-(127.5f*ditherFactor)+0.5f));int b=clamp(originalColor.getBlue()+(int)(threshold-(127.5f*ditherFactor)+0.5f));outputImage.setRGB(x,y,findClosestColor(new Color(r,g,b),targetPalette).getRGB());}}return outputImage;}
    BufferedImage halftoneDitherProcess(BufferedImage image, Color[] targetPalette, double ditherLevelParam) { int width=image.getWidth(),height=image.getHeight();BufferedImage outputImage=new BufferedImage(width,height,BufferedImage.TYPE_INT_RGB);float ditherFactor=(float)ditherLevelParam;for(int y=0;y<height;y++){for(int x=0;x<width;x++){Color originalColor=new Color(image.getRGB(x,y));float thresholdOffset=((x+y)%2==0)?(128f*ditherFactor):(-128f*ditherFactor);int r=clamp(originalColor.getRed()+(int)(thresholdOffset+0.5f));int g=clamp(originalColor.getGreen()+(int)(thresholdOffset+0.5f));int b=clamp(originalColor.getBlue()+(int)(thresholdOffset+0.5f));outputImage.setRGB(x,y,findClosestColor(new Color(r,g,b),targetPalette).getRGB());}}return outputImage;}
    // --- END Specific Dithering Algorithms ---

    // --- Core Image Processing Method ---
    // Calls methods defined above
    void processImage(ImageProcessor ip, int blockX, int blockY, boolean interlaceEnabled, DitheringMode dMode, ColorMode cMode, Color[] activePal, Color[] custPal, UserColorSelection pA, UserColorSelection iA, UserColorSelection pB, UserColorSelection iB, double dLevel, double bright, double cont, double gam, double brightThresh) {
        BufferedImage bufferedImage = ip.getBufferedImage();
        BufferedImage adjustedImage = applyBCG(bufferedImage, bright, cont, gam);
        BufferedImage finalImage = null;

        try {
            if (interlaceEnabled) {
                IJ.log("Processing Interlaced Mode...");
                boolean isPreDithered = dMode.isErrorDiffusion() && dLevel > 0;
                BufferedImage ditheredInputImage = adjustedImage;

                if (isPreDithered) {
                    IJ.log("Interlace: Pre-dithering using " + dMode + "...");
                    Color[] paletteForPreDithering = activePal;
                    if (cMode == ColorMode.USER_DEFINED) { paletteForPreDithering = zxPaletteNormal; if (pA.indexes.isEmpty() && iA.indexes.isEmpty()) paletteForPreDithering = bwPalette; }
                    else if (cMode == ColorMode.CUSTOM) { paletteForPreDithering = custPal != null && custPal.length > 0 ? custPal : bwPalette; }
                    ditheredInputImage = applyDithering(adjustedImage, dMode, paletteForPreDithering, dLevel);
                    IJ.log("Interlace: Pre-dithering complete.");
                } else {
                     IJ.log("Interlace: Using Bayer/None/No Dithering - No pre-dithering needed.");
                }

                finalImage = processInterlaceModeNew(adjustedImage, ditheredInputImage, isPreDithered,
                                                     blockX, blockY, dMode, cMode, activePal, custPal,
                                                     pA, iA, pB, iB, dLevel, brightThresh);
            } else {
                IJ.log("Processing Non-Interlaced Mode...");
                Color[] paletteForDithering = activePal;
                if (cMode == ColorMode.USER_DEFINED) { paletteForDithering = zxPaletteNormal; if (pA.indexes.isEmpty() && iA.indexes.isEmpty()) paletteForDithering = bwPalette; }
                else if (cMode == ColorMode.CUSTOM) { paletteForDithering = custPal != null && custPal.length > 0 ? custPal : bwPalette; }
                BufferedImage ditheredImage = applyDithering(adjustedImage, dMode, paletteForDithering, dLevel);
                finalImage = convertToZXSpectrum(adjustedImage, ditheredImage, blockX, blockY, cMode, pA, iA, brightThresh, paletteForDithering);
            }

        } catch (Exception e) {
             IJ.log("!!! EXCEPTION during processImage !!!"); e.printStackTrace();
             finalImage = new BufferedImage(ip.getWidth(), ip.getHeight(), BufferedImage.TYPE_INT_RGB); Graphics2D g = finalImage.createGraphics(); g.setColor(Color.RED); g.fillRect(0,0,ip.getWidth(), ip.getHeight()); g.setColor(Color.WHITE); g.drawString("Error!", 10, 20); g.dispose();
        }

        if (finalImage != null && ip != null) {
            if (finalImage.getType() == BufferedImage.TYPE_INT_RGB && ip instanceof ColorProcessor) {
                int[] pixels = ((DataBufferInt) finalImage.getRaster().getDataBuffer()).getData();
                if (pixels.length == ip.getPixelCount()) { ip.setPixels(pixels); }
                else { IJ.log("Error: Final image size mismatch. Cannot update processor via setPixels."); ImagePlus tempImp = new ImagePlus("", finalImage); ip.insert(tempImp.getProcessor(), 0, 0); }
            } else {
                 IJ.log("Warning: Processor type or image type mismatch. Using fallback insert."); ImagePlus tempImp = new ImagePlus("", finalImage); ImageProcessor tempIp = tempImp.getProcessor();
                 if (tempIp != null && tempIp.getWidth() <= ip.getWidth() && tempIp.getHeight() <= ip.getHeight()) { ip.insert(tempIp, 0, 0); }
                 else { IJ.log("Error: Final image invalid or larger than processor."); }
            }
        } else { IJ.log("Error: Final image was null or processor was null."); }
    }


     // --- Interlace Processing Method Implementation ---
     BufferedImage processInterlaceModeNewOld(BufferedImage adjustedImage, BufferedImage ditheredInputImage, boolean isPreDithered,
                                           int blockX, int blockY, DitheringMode dMode, ColorMode cMode,
                                           Color[] activePal, Color[] custPal,
                                           UserColorSelection pA, UserColorSelection iA, UserColorSelection pB, UserColorSelection iB,
                                           double dLevel, double brightThresh)
     {
         IJ.log("--- Starting Interlace Processing (isPreDithered=" + isPreDithered + ") ---"); int width = adjustedImage.getWidth(); int height = adjustedImage.getHeight(); BufferedImage avgImage = new BufferedImage(width, height, BufferedImage.TYPE_INT_RGB); WritableRaster avgRaster = avgImage.getRaster(); Color[] finalBlockPalette = zxPaletteNormal; // Default, may be updated
         for (int by = 0; by < height; by += blockY) { IJ.showProgress((double)by / height); for (int bx = 0; bx < width; bx += blockX) { int currentBlockW = Math.min(blockX, width - bx); int currentBlockH = Math.min(blockY, height - by); if (currentBlockW <= 0 || currentBlockH <= 0) continue; BufferedImage originalBlockRegion = adjustedImage.getSubimage(bx, by, currentBlockW, currentBlockH); BufferedImage ditherInputBlockRegion = ditheredInputImage.getSubimage(bx, by, currentBlockW, currentBlockH); List<Color> paperAColors, inkAColors, paperBColors, inkBColors; BrightMode resolvedBrightModeA = BrightMode.OFF; BrightMode resolvedBrightModeB = BrightMode.OFF; Color[] sourcePal;
         if (cMode == ColorMode.USER_DEFINED) { resolvedBrightModeA = determineBlockBrightMode(pA, iA); if (resolvedBrightModeA == BrightMode.ALLOWED) { resolvedBrightModeA = checkBlockBrightness(originalBlockRegion, brightThresh) ? BrightMode.FORCED : BrightMode.OFF; } resolvedBrightModeB = determineBlockBrightMode(pB, iB); if (resolvedBrightModeB == BrightMode.ALLOWED) { resolvedBrightModeB = checkBlockBrightness(originalBlockRegion, brightThresh) ? BrightMode.FORCED : BrightMode.OFF; } paperAColors = getPaletteColors(resolvedBrightModeA, pA.indexes); inkAColors = getPaletteColors(resolvedBrightModeA, iA.indexes); paperBColors = getPaletteColors(resolvedBrightModeB, pB.indexes); inkBColors = getPaletteColors(resolvedBrightModeB, iB.indexes); finalBlockPalette = (resolvedBrightModeA == BrightMode.FORCED || resolvedBrightModeB == BrightMode.FORCED) ? zxPaletteBright : zxPaletteNormal; if (bx == 0 && by == 0) IJ.log(String.format("Interlace Block(0,0) USER_DEFINED: BrightA=%s, BrightB=%s", resolvedBrightModeA, resolvedBrightModeB));
         } else { BrightMode blockBrightMode = BrightMode.OFF; if (cMode == ColorMode.ZX_BRIGHT_ATTRIBUTE) { boolean isBright = checkBlockBrightness(originalBlockRegion, brightThresh); blockBrightMode = isBright ? BrightMode.FORCED : BrightMode.OFF; if (bx == 0 && by == 0) IJ.log(String.format("Interlace Block(0,0) ZX_BRIGHT_ATTRIBUTE Check: isBright=%b -> blockBrightMode=%s", isBright, blockBrightMode)); } else { blockBrightMode = BrightMode.OFF; } sourcePal = (cMode == ColorMode.CUSTOM) ? custPal : activePal; if (sourcePal == null) sourcePal = zxPaletteNormal; Color[] paletteToUse; if (blockBrightMode == BrightMode.FORCED && (cMode == ColorMode.ZX_NORMAL || cMode == ColorMode.ZX_BRIGHT_ATTRIBUTE)) { paletteToUse = zxPaletteBright; finalBlockPalette = zxPaletteBright; if (bx == 0 && by == 0) IJ.log("Interlace Block(0,0): Using BRIGHT Palette"); } else { paletteToUse = sourcePal; finalBlockPalette = sourcePal; if (bx == 0 && by == 0) IJ.log("Interlace Block(0,0): Using NORMAL/Source Palette"); } List<Color> allColors = Arrays.asList(paletteToUse); paperAColors = new ArrayList<>(allColors); inkAColors = new ArrayList<>(allColors); paperBColors = new ArrayList<>(allColors); inkBColors = new ArrayList<>(allColors); if (bx == 0 && by == 0) IJ.log(String.format("Interlace Block(0,0): Candidate list size=%d, First paperA = %s", paperAColors.size(), colorToName(paperAColors.isEmpty() ? null : paperAColors.get(0))));
         }
         if (paperAColors.isEmpty()) paperAColors.add(Color.BLACK); if (inkAColors.isEmpty()) inkAColors.add(Color.WHITE); if (paperBColors.isEmpty()) paperBColors.add(Color.BLACK); if (inkBColors.isEmpty()) inkBColors.add(Color.WHITE);
         double bestError = Double.MAX_VALUE; Color bestPaperA = paperAColors.get(0); Color bestInkA = findClosestDifferentPaletteColor(bestPaperA, inkAColors); if (bestInkA == null) bestInkA = findClosestDifferentPaletteColor(bestPaperA, finalBlockPalette); if (bestInkA == null) bestInkA = !bestPaperA.equals(Color.WHITE) ? Color.WHITE : Color.BLACK; Color bestPaperB = paperBColors.get(0); Color bestInkKB = findClosestDifferentPaletteColor(bestPaperB, inkBColors); if (bestInkKB == null) bestInkKB = findClosestDifferentPaletteColor(bestPaperB, finalBlockPalette); if (bestInkKB == null) bestInkKB = !bestPaperB.equals(Color.WHITE) ? Color.WHITE : Color.BLACK;
         int pairChecks = 0; final int MAX_CHECKS = 10000;
         searchLoop: for (Color colorPaperA : paperAColors) { for (Color colorInkA : inkAColors) { if (colorPaperA.equals(colorInkA)) continue; for (Color colorPaperB : paperBColors) { for (Color colorInkB : inkBColors) { if (colorPaperB.equals(colorInkB)) continue; pairChecks++; if (pairChecks > MAX_CHECKS) { if(bx == 0 && by == 0) IJ.log("Warning: Interlace block (" + bx + "," + by + ") exceeded max pair checks (" + MAX_CHECKS + ")."); break searchLoop; }
             boolean[][] ditherA = ditherBlockBoolean(ditherInputBlockRegion, dMode, colorPaperA, colorInkA, dLevel, isPreDithered);
             boolean[][] ditherB = ditherBlockBoolean(ditherInputBlockRegion, dMode, colorPaperB, colorInkB, dLevel, isPreDithered);
             double currentError = blockErrorBoolean(ditherInputBlockRegion, ditherA, ditherB, colorPaperA, colorInkA, colorPaperB, colorInkB);
             if (currentError < bestError) { bestError = currentError; bestPaperA = colorPaperA; bestInkA = colorInkA; bestPaperB = colorPaperB; bestInkKB = colorInkB; } if (bestError < 1e-6) break searchLoop;
         } } } }
         boolean[][] finalDitherA = ditherBlockBoolean(ditherInputBlockRegion, dMode, bestPaperA, bestInkA, dLevel, isPreDithered);
         boolean[][] finalDitherB = ditherBlockBoolean(ditherInputBlockRegion, dMode, bestPaperB, bestInkKB, dLevel, isPreDithered);
         int[] pixelData = new int[currentBlockW * 3]; for (int dy = 0; dy < currentBlockH; dy++) { int k=0; for (int dx = 0; dx < currentBlockW; dx++) { boolean inkA_state = finalDitherA[dy][dx]; boolean inkB_state = finalDitherB[dy][dx]; Color combinedColor; if (!inkA_state && !inkB_state) { combinedColor = averageColors(bestPaperA, bestPaperB); } else if ( inkA_state && !inkB_state) { combinedColor = averageColors(bestInkA, bestPaperB); } else if (!inkA_state && inkB_state) { combinedColor = averageColors(bestPaperA, bestInkKB); } else { combinedColor = averageColors(bestInkA, bestInkKB); } pixelData[k++] = combinedColor.getRed(); pixelData[k++] = combinedColor.getGreen(); pixelData[k++] = combinedColor.getBlue(); } avgRaster.setPixels(bx, by + dy, currentBlockW, 1, pixelData); }
         if (bx == 0 && by == 0) { IJ.log(String.format("Interlace Block(0,0): Best Pair A: P=%s, I=%s. Best Pair B: P=%s, I=%s. Error=%.2f", colorToName(bestPaperA), colorToName(bestInkA), colorToName(bestPaperB), colorToName(bestInkKB), bestError)); }
         } } IJ.showProgress(1.0); IJ.log("--- Finished Interlace Processing ---"); return avgImage;
     }
     // --- END Interlace Method Implementation ---

// --- Updated Interlace Processing with Dual Palettes ---
BufferedImage processInterlaceModeNew(BufferedImage adjustedImage, BufferedImage ditheredInputImage, boolean isPreDithered,
                                      int blockX, int blockY, DitheringMode dMode, ColorMode cMode,
                                      Color[] activePal, Color[] custPal,
                                      UserColorSelection pA, UserColorSelection iA, UserColorSelection pB, UserColorSelection iB,
                                      double dLevel, double brightThresh) 
{
    IJ.log("--- Starting Interlace Processing (Dual Palette Mode) ---");
    int width = adjustedImage.getWidth();
    int height = adjustedImage.getHeight();
    
    // Get palette configurations from UI selections
    Color[] paletteA = getFramePalette(activePal, pA);
    Color[] paletteB = getFramePalette(activePal, pB);
    
    BufferedImage frameA = createDitheredFrame(ditheredInputImage, paletteA, pA, iA, blockX, blockY, dMode, dLevel, isPreDithered);
    BufferedImage frameB = createDitheredFrame(ditheredInputImage, paletteB, pB, iB, blockX, blockY, dMode, dLevel, isPreDithered);
    
    return createAveragedFrame(frameA, frameB);
}

// --- Helper: Get frame-specific palette ---
private Color[] getFramePalette(Color[] basePalette, UserColorSelection selection) {
    Set<Color> colors = new LinkedHashSet<>();
    for(int index : selection.indexes) {
        if(index >= 0 && index < basePalette.length) {
            colors.add(basePalette[index]);
        }
    }
    return colors.toArray(new Color[0]);
}

// --- Helper: Create dithered frame with specific palette ---
private BufferedImage createDitheredFrame(BufferedImage source, Color[] palette, 
                                         UserColorSelection paperSel, UserColorSelection inkSel,
                                         int blockX, int blockY, DitheringMode dMode, 
                                         double dLevel, boolean isPreDithered) 
{
    BufferedImage frame = new BufferedImage(source.getWidth(), source.getHeight(), BufferedImage.TYPE_INT_RGB);
    WritableRaster raster = frame.getRaster();

    for(int by = 0; by < source.getHeight(); by += blockY) {
        for(int bx = 0; bx < source.getWidth(); bx += blockX) {
            int currentBlockW = Math.min(blockX, source.getWidth() - bx);
            int currentBlockH = Math.min(blockY, source.getHeight() - by);
            
            BufferedImage blockRegion = source.getSubimage(bx, by, currentBlockW, currentBlockH);
            
            // Get allowed colors for this frame from selections
            List<Color> paperColors = getColorsFromSelection(palette, paperSel);
            List<Color> inkColors = getColorsFromSelection(palette, inkSel);
            
            // Find best color pair
            ColorPair bestPair = findBestColorPair(blockRegion, paperColors, inkColors);
            
            // Dither block with selected colors
            boolean[][] ditherMask = ditherBlockBoolean(
                blockRegion, dMode, bestPair.paper, bestPair.ink, dLevel, isPreDithered
            );
            
            // Apply to frame
            for(int dy = 0; dy < currentBlockH; dy++) {
                for(int dx = 0; dx < currentBlockW; dx++) {
                    Color color = ditherMask[dy][dx] ? bestPair.ink : bestPair.paper;
                    raster.setPixel(bx + dx, by + dy, new int[] {
                        color.getRed(),
                        color.getGreen(),
                        color.getBlue()
                    });
                }
            }
        }
    }
    return frame;
}

// --- Helper: Get colors from user selection ---
private List<Color> getColorsFromSelection(Color[] palette, UserColorSelection sel) {
    List<Color> colors = new ArrayList<>();
    for(int index : sel.indexes) {
        if(index >= 0 && index < palette.length) {
            colors.add(palette[index]);
        }
    }
    return colors.isEmpty() ? Arrays.asList(palette) : colors;
}

// --- Helper: Find optimal color pair ---
private ColorPair findBestColorPair(BufferedImage block, List<Color> papers, List<Color> inks) {
    double minError = Double.MAX_VALUE;
    ColorPair best = new ColorPair(papers.get(0), inks.get(0));
    
    for(Color paper : papers) {
        for(Color ink : inks) {
            if(paper.equals(ink)) continue;
            
            double error = calculateColorError(block, paper, ink);
            if(error < minError) {
                minError = error;
                best = new ColorPair(paper, ink);
            }
        }
    }
    return best;
}

// --- Color Pair Container ---
private class ColorPair {
    final Color paper;
    final Color ink;
    
    ColorPair(Color paper, Color ink) {
        this.paper = paper;
        this.ink = ink;
    }
}

// --- Averaging Method ---
private BufferedImage createAveragedFrame(BufferedImage frameA, BufferedImage frameB) {
    BufferedImage result = new BufferedImage(
        frameA.getWidth(), frameA.getHeight(), BufferedImage.TYPE_INT_RGB
    );
    
    WritableRaster raster = result.getRaster();
    int[] pixelA = new int[3];
    int[] pixelB = new int[3];
    
    for(int y = 0; y < frameA.getHeight(); y++) {
        for(int x = 0; x < frameA.getWidth(); x++) {
            frameA.getRaster().getPixel(x, y, pixelA);
            frameB.getRaster().getPixel(x, y, pixelB);
            
            int avgR = (pixelA[0] + pixelB[0]) / 2;
            int avgG = (pixelA[1] + pixelB[1]) / 2;
            int avgB = (pixelA[2] + pixelB[2]) / 2;
            
            raster.setPixel(x, y, new int[] {avgR, avgG, avgB});
        }
    }
    return result;
}

// --- Color Error Calculation ---
private double calculateColorError(BufferedImage block, Color paper, Color ink) {
    double totalError = 0.0;
    int width = block.getWidth();
    int height = block.getHeight();
    
    for (int y = 0; y < height; y++) {
        for (int x = 0; x < width; x++) {
            Color original = new Color(block.getRGB(x, y));
            
            // Calculate error for both possible colors
            double errorPaper = colorDistanceSq(original, paper);
            double errorInk = colorDistanceSq(original, ink);
            
            // Use minimum error (best possible dither choice)
            totalError += Math.min(errorPaper, errorInk);
        }
    }
    
    return totalError;
}


    /** Helper to check average brightness of a block */
     private boolean checkBlockBrightness(BufferedImage blockRegion, double brightThresh) { /* ... Same as before ... */ long totalIntensity = 0; int pixelCount = 0; int width = blockRegion.getWidth(); int height = blockRegion.getHeight(); if (blockRegion.getType() == BufferedImage.TYPE_INT_RGB) { int[] pixels = ((DataBufferInt) blockRegion.getRaster().getDataBuffer()).getData(); for (int rgb : pixels) { int r = (rgb >> 16) & 0xff; int g = (rgb >> 8) & 0xff; int b = rgb & 0xff; totalIntensity += (r + g + b); pixelCount++; } if (pixelCount > 0) { return (totalIntensity / (pixelCount * 3.0)) >= brightThresh; } } else { for (int y = 0; y < height; y++) { for (int x = 0; x < width; x++) { Color c = new Color(blockRegion.getRGB(x, y)); totalIntensity += (c.getRed() + c.getGreen() + c.getBlue()); pixelCount++; } } if (pixelCount > 0) { return (totalIntensity / (pixelCount * 3.0)) >= brightThresh; } } return false; }

    // --- Non-Interlaced Block Processing Wrapper ---
    BufferedImage convertToZXSpectrum(BufferedImage adjustedImage, BufferedImage ditheredImage, int blockWidth, int blockHeight, ColorMode cMode, UserColorSelection paperA, UserColorSelection inkA, double brightThresh, Color[] ditherPalette) { /* ... Same as before ... */ int width = ditheredImage.getWidth(), height = ditheredImage.getHeight(); BufferedImage zxImage = new BufferedImage(width, height, BufferedImage.TYPE_INT_RGB); if (blockWidth <= 1 && blockHeight <= 1) { IJ.log("Attributes disabled (block size 1x1). Applying dithered result directly."); Graphics2D g = zxImage.createGraphics(); g.drawImage(ditheredImage, 0, 0, null); g.dispose(); return zxImage; } for (int yStart = 0; yStart < height; yStart += blockHeight) { for (int xStart = 0; xStart < width; xStart += blockWidth) { processBlock(adjustedImage, ditheredImage, zxImage, xStart, yStart, blockWidth, blockHeight, cMode, paperA, inkA, brightThresh, ditherPalette); } } return zxImage; }

    /** Processes a single block for non-interlaced output (Handles USER_DEFINED Option 1, FIXED Fallback logic) */
    void processBlock(BufferedImage adjustedImage, BufferedImage ditheredImage, BufferedImage outputImage,
                      int startX, int startY, int blockWidth, int blockHeight, ColorMode cMode,
                      UserColorSelection paperA, UserColorSelection inkA, // Receive parsed selections
                      double brightThresh, Color[] ditherPalette)
    {/* ... Same as before ... */
        boolean logThisBlock=(startX==0&&startY==0);if(logThisBlock)IJ.log(String.format("processBlock START (%d,%d) Mode=%s, PaperSel=%s, InkSel=%s",startX,startY,cMode,paperA,inkA));
        int endX=Math.min(startX+blockWidth,ditheredImage.getWidth());int endY=Math.min(startY+blockHeight,ditheredImage.getHeight());if(startX>=endX||startY>=endY)return;BrightMode blockBrightMode=BrightMode.OFF;Color[] blockPaletteNormal=zxPaletteNormal;Color[] blockPaletteBright=zxPaletteBright;
        if(cMode==ColorMode.USER_DEFINED){blockBrightMode=determineBlockBrightMode(paperA,inkA);if(blockBrightMode==BrightMode.ALLOWED){double totalIntensity=0;int pixelCount=0;for(int y=startY;y<endY;y++){for(int x=startX;x<endX;x++){Color adjColor=new Color(adjustedImage.getRGB(x,y));totalIntensity+=(adjColor.getRed()+adjColor.getGreen()+adjColor.getBlue())/3.0;pixelCount++;}}if(pixelCount>0&&(totalIntensity/pixelCount)>=brightThresh){blockBrightMode=BrightMode.FORCED;}else{blockBrightMode=BrightMode.OFF;}}}else if(cMode==ColorMode.ZX_BRIGHT_ATTRIBUTE){double totalIntensity=0;int pixelCount=0;for(int y=startY;y<endY;y++){for(int x=startX;x<endX;x++){Color adjColor=new Color(adjustedImage.getRGB(x,y));totalIntensity+=(adjColor.getRed()+adjColor.getGreen()+adjColor.getBlue())/3.0;pixelCount++;}}if(pixelCount>0&&(totalIntensity/pixelCount)>=brightThresh){blockBrightMode=BrightMode.FORCED;}else{blockBrightMode=BrightMode.OFF;}}Color[] finalBlockPalette=(blockBrightMode==BrightMode.FORCED)?blockPaletteBright:blockPaletteNormal;Color finalInk=Color.BLACK;Color finalPaper=Color.WHITE;
        if(cMode==ColorMode.USER_DEFINED){if(logThisBlock)IJ.log(String.format("processBlock (%d,%d) EXECUTING USER_DEFINED BRANCH",startX,startY));List<Color> allowedPaperColors=getPaletteColors(blockBrightMode,paperA.indexes);List<Color> allowedInkColors=getPaletteColors(blockBrightMode,inkA.indexes);if(logThisBlock)IJ.log(String.format("processBlock (%d,%d) AllowedPaper=%s, AllowedInk=%s",startX,startY,allowedPaperColors,allowedInkColors));if(allowedInkColors.isEmpty()){allowedInkColors.add(finalBlockPalette[0]);}if(allowedPaperColors.isEmpty()){Color tempP=findClosestDifferentPaletteColor(allowedInkColors.get(0),finalBlockPalette);allowedPaperColors.add(tempP!=null?tempP:(finalBlockPalette.length>1?finalBlockPalette[1]:finalBlockPalette[0]));}Set<Color> allowedBlockSet=new LinkedHashSet<>(allowedInkColors);allowedBlockSet.addAll(allowedPaperColors);List<Color> allowedBlockColors=new ArrayList<>(allowedBlockSet);Map<Color,Integer> colorCounts=new HashMap<>();if(!allowedBlockColors.isEmpty()){for(int y=startY;y<endY;y++){for(int x=startX;x<endX;x++){Color ditheredPixelColor=new Color(ditheredImage.getRGB(x,y));Color closestAllowed=findClosestColor(ditheredPixelColor,allowedBlockColors);colorCounts.put(closestAllowed,colorCounts.getOrDefault(closestAllowed,0)+1);}}}List<Map.Entry<Color,Integer>> sortedCounts=new ArrayList<>(colorCounts.entrySet());sortedCounts.sort((e1,e2)->e2.getValue().compareTo(e1.getValue()));finalInk=null;for(Map.Entry<Color,Integer> entry:sortedCounts){if(allowedInkColors.contains(entry.getKey())){finalInk=entry.getKey();break;}}if(finalInk==null){finalInk=!allowedInkColors.isEmpty()?allowedInkColors.get(0):finalBlockPalette[0];if(logThisBlock)IJ.log("Block ("+startX+","+startY+") UserDefined Ink: Fallback used -> "+colorToName(finalInk));}finalPaper=null;for(Map.Entry<Color,Integer> entry:sortedCounts){Color potentialPaper=entry.getKey();if(!potentialPaper.equals(finalInk)&&allowedPaperColors.contains(potentialPaper)){finalPaper=potentialPaper;break;}}
        if(finalPaper==null){if(logThisBlock)IJ.log(String.format("processBlock (%d,%d) Paper Fallback 1 triggered (most frequent failed).",startX,startY));Color fallback1Paper=findClosestDifferentPaletteColor(finalInk,allowedPaperColors);if(logThisBlock)IJ.log(String.format("processBlock (%d,%d) Paper Fallback 1: Ink=%s, AllowedPapers=%s -> Result=%s",startX,startY,colorToName(finalInk),allowedPaperColors,colorToName(fallback1Paper)));if(fallback1Paper==null){if(logThisBlock)IJ.log(String.format("processBlock (%d,%d) Paper Fallback 1 failed (no different allowed paper)! Triggering Fallback 1.5.",startX,startY));Color fallback1_5Paper=findClosestDifferentPaletteColor(finalInk,allowedInkColors);if(logThisBlock)IJ.log(String.format("processBlock (%d,%d) Paper Fallback 1.5: Ink=%s, AllowedInks=%s -> Result=%s",startX,startY,colorToName(finalInk),allowedInkColors,colorToName(fallback1_5Paper)));if(fallback1_5Paper!=null){finalPaper=fallback1_5Paper;if(logThisBlock)IJ.log(String.format("processBlock (%d,%d) Paper Fallback 1.5 successful.",startX,startY));}else{if(logThisBlock)IJ.log(String.format("processBlock (%d,%d) Paper Fallback 1.5 failed! Triggering Fallback 2.",startX,startY));finalPaper=findClosestDifferentPaletteColor(finalInk,finalBlockPalette);if(logThisBlock)IJ.log(String.format("processBlock (%d,%d) Paper Fallback 2: Ink=%s, BlockPalette -> Result=%s",startX,startY,colorToName(finalInk),colorToName(finalPaper)));if(finalPaper==null||finalPaper.equals(finalInk)){finalPaper=finalBlockPalette.length>0?finalBlockPalette[0]:Color.WHITE;if(finalPaper.equals(finalInk)&&finalBlockPalette.length>1){finalPaper=finalBlockPalette[1];}else if(finalPaper.equals(finalInk)&&finalBlockPalette.length==1){finalPaper=finalBlockPalette[0];}if(logThisBlock)IJ.log(String.format("processBlock (%d,%d) Paper Fallback 2 failed/returned ink! Using ultimate fallback: %s",startX,startY,colorToName(finalPaper)));}}}else{finalPaper=fallback1Paper;if(logThisBlock)IJ.log(String.format("processBlock (%d,%d) Paper Fallback 1 successful.",startX,startY));}}
        if(logThisBlock)IJ.log(String.format("processBlock (%d,%d) UserDefined Final -> Ink: %s Paper: %s",startX,startY,colorToName(finalInk),colorToName(finalPaper)));
        }else{if(logThisBlock)IJ.log(String.format("processBlock (%d,%d) EXECUTING DOMINANT COLOR (ELSE) BRANCH for mode %s",startX,startY,cMode));Map<Color,Integer> colorCounts=new HashMap<>();for(int y=startY;y<endY;y++){for(int x=startX;x<endX;x++){Color ditheredPixelColor=new Color(ditheredImage.getRGB(x,y));Color closestInBlockPalette=findClosestColor(ditheredPixelColor,finalBlockPalette);colorCounts.put(closestInBlockPalette,colorCounts.getOrDefault(closestInBlockPalette,0)+1);}}if(!colorCounts.isEmpty()){java.util.List<Map.Entry<Color,Integer>> entryList=new java.util.ArrayList<>(colorCounts.entrySet());entryList.sort((e1,e2)->e2.getValue().compareTo(e1.getValue()));finalInk=entryList.get(0).getKey();if(entryList.size()>1){finalPaper=entryList.get(1).getKey();if(finalPaper.equals(finalInk)){finalPaper=findClosestDifferentPaletteColor(finalInk,finalBlockPalette);}}else{finalPaper=findClosestDifferentPaletteColor(finalInk,finalBlockPalette);}if(finalPaper==null){finalPaper=finalBlockPalette.length>1?finalBlockPalette[1]:finalBlockPalette[0];if(finalPaper.equals(finalInk)&&finalBlockPalette.length>0)finalPaper=finalBlockPalette[0];}}else{finalInk=finalBlockPalette.length>0?finalBlockPalette[0]:Color.BLACK;finalPaper=findClosestDifferentPaletteColor(finalInk,finalBlockPalette);if(finalPaper==null){finalPaper=finalBlockPalette.length>1?finalBlockPalette[1]:finalBlockPalette[0];if(finalPaper.equals(finalInk)&&finalBlockPalette.length>0)finalPaper=finalBlockPalette[0];}}if(logThisBlock)IJ.log(String.format("processBlock (%d,%d) Dominant Final -> Ink: %s Paper: %s",startX,startY,colorToName(finalInk),colorToName(finalPaper)));}
        for(int y=startY;y<endY;y++){for(int x=startX;x<endX;x++){Color ditheredPixelColor=new Color(ditheredImage.getRGB(x,y));double distInk=colorDistanceSq(ditheredPixelColor,finalInk);double distPaper=colorDistanceSq(ditheredPixelColor,finalPaper);outputImage.setRGB(x,y,(distInk<=distPaper)?finalInk.getRGB():finalPaper.getRGB());}}if(logThisBlock)IJ.log(String.format("processBlock END (%d,%d)",startX,startY));
    }

// Modified distributeError method with dither level
private void distributeError(Color error, int x, int y, 
                            float[][] errorBufferA, float[][] errorBufferB,
                            double ditherLevel) {
    // Get weights based on active dithering mode
    float[] weights = getDitherWeights(ditheringMode);
    
    // Example Floyd-Steinberg weights
    int[][] offsets = {{1,0}, {-1,1}, {0,1}, {1,1}};
    
    for (int i = 0; i < weights.length; i++) {
        int dx = offsets[i][0];
        int dy = offsets[i][1];
        
        if (x+dx >= 0 && x+dx < width && y+dy >= 0 && y+dy < height) {
            float scaledError = (float) (weights[i] * ditherLevel);
            
            // Distribute to both frames equally
            errorBufferA[x+dx][y+dy] += error.getRed() * scaledError;
            errorBufferB[x+dx][y+dy] += error.getRed() * scaledError;
            // Repeat for green and blue channels
        }
    }
}


    // --- Color Utility Methods ---
// Replace ALL instances of getPaletteColors() with this single method

private List<Color> getPaletteColors(BrightMode brightnessMode, List<Integer> indexes) {
    Color[] basePalette = brightnessMode == BrightMode.FORCED ? 
                          zxPaletteBright : zxPaletteNormal;
    
    List<Color> colors = new ArrayList<>();
    for (int index : indexes) {
        if (index >= 0 && index < basePalette.length) {
            colors.add(basePalette[index]);
        }
    }
    
    // Fallback to full palette if selection is empty
    if (colors.isEmpty()) {
        return new ArrayList<>(Arrays.asList(basePalette));
    }
    
    return colors;
}

// Remove any other versions of these methods:
// - getColorsFromSelection()
// - getPaletteColors() with different signatures

//    List<Color> getPaletteColors(BrightMode b, List<Integer> i){ List<Color> r=new ArrayList<>();Color[] s;if(b==BrightMode.FORCED){s=zxPaletteBright;}else{s=zxPaletteNormal;}if(i==null||i.isEmpty()){r.addAll(Arrays.asList(s));}else{for(int x:i){if(x>=0&&x<s.length){if(!r.contains(s[x])){r.add(s[x]);}}}}if(r.isEmpty()){IJ.log("Warning: getPaletteColors resulted in empty list for block. Adding default Black.");r.add(s[0]);}return r;}
    Color getBrightColor(Color n){ if(n==null)return Color.BLACK; for(int i=0;i<zxPaletteNormal.length;i++)if(zxPaletteNormal[i].equals(n))return zxPaletteBright[i]; return n;}
    Color findClosestDifferentPaletteColor(Color inputColor, Color[] targetPalette) { Color closest=null;double minDistanceSq=Double.MAX_VALUE;boolean foundDifferent=false;if(targetPalette!=null&&targetPalette.length>0){for(Color paletteColor:targetPalette){if(paletteColor==null||paletteColor.equals(inputColor))continue;foundDifferent=true;double distanceSq=colorDistanceSq(inputColor,paletteColor);if(distanceSq<minDistanceSq){minDistanceSq=distanceSq;closest=paletteColor;}}}if(foundDifferent){return closest;}else{return null;}}
    Color findClosestDifferentPaletteColor(Color i, List<Color> t){ if(t==null||t.isEmpty()){return null;} return findClosestDifferentPaletteColor(i,t.toArray(new Color[0]));}
    double colorDistanceSq(Color c1, Color c2){ long dr=c1.getRed()-c2.getRed();long dg=c1.getGreen()-c2.getGreen();long db=c1.getBlue()-c2.getBlue(); return dr*dr+dg*dg+db*db; }
    double colorDistance(Color c1, Color c2){ return Math.sqrt(colorDistanceSq(c1, c2)); }
    Color findClosestColor(Color i, Color[] t){ if(t==null||t.length==0)return Color.BLACK; Color c=t[0];double m=colorDistanceSq(i,c);for(int j=1;j<t.length;j++){if(m==0)break; Color p=t[j];double d=colorDistanceSq(i,p);if(d<m){m=d;c=p;}}return c; }
    Color findClosestColor(Color i, List<Color> t){ if(t==null||t.isEmpty())return Color.BLACK; Color[] p=t.toArray(new Color[0]); if(p.length<1)return Color.BLACK; return findClosestColor(i,p); }

    // --- Palette Loading ---
    boolean loadPaletteFromFile(String filePath) { java.util.List<Color> loadedPalette = new java.util.ArrayList<>(); try (BufferedReader br = new BufferedReader(new FileReader(filePath))) { String line; int lineNum = 0; while ((line = br.readLine()) != null) { lineNum++; line = line.trim(); if (line.isEmpty() || line.startsWith("#") || line.startsWith(";") || line.startsWith("//")) continue; String[] values = line.split("[,\\s]+"); if (values.length >= 3) { try { int r = clamp(Integer.parseInt(values[0].trim())); int g = clamp(Integer.parseInt(values[1].trim())); int b = clamp(Integer.parseInt(values[2].trim())); loadedPalette.add(new Color(r, g, b)); } catch (NumberFormatException nfe) { IJ.log("Warning: Invalid number format on line " + lineNum + ": " + line); } } else { IJ.log("Warning: Skipping malformed line " + lineNum + " (needs R, G, B): " + line); } } if (!loadedPalette.isEmpty()) { this.customPalette = loadedPalette.toArray(new Color[0]); IJ.log("Loaded " + this.customPalette.length + " colors from " + new File(filePath).getName()); return true; } else { IJ.error("Palette Loading", "No valid colors found in file: " + filePath); this.customPalette = null; return false; } } catch (IOException ex) { IJ.error("Palette Loading Error", "Error reading file:\n" + ex.getMessage()); this.customPalette = null; return false; } }

    // --- Helper Methods for Active Palette ---
    public Color[] getActivePalette() { /* ... Same as before ... */ switch (this.colorMode) { case ZX_NORMAL: case ZX_BRIGHT_ATTRIBUTE: return zxPaletteNormal; case C64: return c64Palette; case EGA: return egaPalette; case BLACK_AND_WHITE: return bwPalette; case BLACK_RED_GREEN_WHITE: return brgwPalette; case USER_DEFINED: return zxPaletteNormal; case CUSTOM: return (this.customPalette != null && this.customPalette.length > 0) ? this.customPalette : bwPalette; default: return zxPaletteNormal; } }

    // --- FIXED colorToName ---
     String colorToName(Color c) { if (c == null) return "null"; for(int i=0; i<zxPaletteNormal.length; i++) if(zxPaletteNormal[i].equals(c)) return "ZXN"+i; for(int i=0; i<zxPaletteBright.length; i++) if(zxPaletteBright[i].equals(c)) return "ZXB"+i; return String.format("RGB(%d,%d,%d)", c.getRed(), c.getGreen(), c.getBlue()); }
    // --- END FIXED colorToName ---

    // --- UI Component Visibility Update ---
    private void updateComponentVisibility() { /* ... Same as before ... */ if (colorModeChoice == null || userDefinedPanel == null || interlaceCheckbox == null || paperBLabel == null || paperBField == null || inkBLabel == null || inkBField == null) { return; } ColorMode selectedMode = ColorMode.fromString(colorModeChoice.getSelectedItem()); boolean showUserDefined = (selectedMode == ColorMode.USER_DEFINED); boolean needsResize = false; if (userDefinedPanel.isVisible() != showUserDefined) { userDefinedPanel.setVisible(showUserDefined); needsResize = true; } if (showUserDefined) { boolean showFrameBFields = interlaceCheckbox.getState(); boolean currentVisibility = paperBLabel.isVisible(); if (currentVisibility != showFrameBFields) { paperBLabel.setVisible(showFrameBFields); paperBField.setVisible(showFrameBFields); inkBLabel.setVisible(showFrameBFields); inkBField.setVisible(showFrameBFields); needsResize = true; } } if (needsResize) { pack(); } }

    // --- Added Interlace Helper Methods ---
    /** Dithers a block using only two colors and returns boolean map (Ink=true) */
    private boolean[][] ditherBlockBoolean(BufferedImage sourceBlockRegion, DitheringMode dMode, Color paper, Color ink, double dLevel, boolean isPreDithered) { int bw = sourceBlockRegion.getWidth(); int bh = sourceBlockRegion.getHeight(); boolean[][] result = new boolean[bh][bw]; int[][] matrix = getDitherMatrixForMode(dMode); int mh = matrix.length; int mw = matrix[0].length; int levels = mw * mh; float levelF = (float)dLevel; for (int dy = 0; dy < bh; dy++) { for (int dx = 0; dx < bw; dx++) { Color orig = new Color(sourceBlockRegion.getRGB(dx, dy)); int thresholdValue = matrix[dy % mh][dx % mw]; boolean useInk; if (!isPreDithered && levels > 1 && levelF > 0) { double distInkSq=colorDistanceSq(orig,ink); double distPaperSq=colorDistanceSq(orig,paper); double mixRatio=(distInkSq+distPaperSq>1e-9)?distInkSq/(distInkSq+distPaperSq):0.5; double bayerThreshold=(double)thresholdValue/(levels); double effectiveThreshold=0.5+(bayerThreshold-0.5)*levelF; effectiveThreshold=Math.max(0.0,Math.min(1.0,effectiveThreshold)); useInk=(mixRatio<effectiveThreshold); } else { useInk=colorDistanceSq(orig,ink)<=colorDistanceSq(orig,paper); } result[dy][dx]=useInk; } } return result; }
    /** Gets the appropriate Bayer matrix */
     private int[][] getDitherMatrixForMode(DitheringMode dMode) { switch(dMode){case BAYER_2X2:return BAYER_MATRIX_2X2;case BAYER_4X4:return BAYER_MATRIX_4X4;case BAYER_8X8:return BAYER_MATRIX_8X8;default:return new int[][]{{0}};} }
     /** Helper method to average two colors (DEFINED ONCE HERE) */
     private Color averageColors(Color c1, Color c2) { if (c1 == null || c2 == null) return Color.BLACK; int r = clamp((c1.getRed() + c2.getRed()) / 2); int g = clamp((c1.getGreen() + c2.getGreen()) / 2); int b = clamp((c1.getBlue() + c2.getBlue()) / 2); return new Color(r, g, b); }
    /** Calculates the squared error between a reference block and the combined interlaced block */
    private double blockErrorBoolean(BufferedImage referenceBlockRegion, boolean[][] ditherA, boolean[][] ditherB, Color paperA, Color inkA, Color paperB, Color inkB) {
         double totalErrorSq=0;int bh=ditherA.length;if(bh==0)return 0;int bw=ditherA[0].length;if(bw==0)return 0;
         int[] referencePixels = referenceBlockRegion.getRGB(0, 0, bw, bh, null, 0, bw); int pixelIndex = 0;
         for(int dy=0;dy<bh;dy++){ for(int dx=0;dx<bw;dx++){ if(pixelIndex>=referencePixels.length)continue; boolean inkA_state=ditherA[dy][dx]; boolean inkB_state=ditherB[dy][dx]; Color combinedColor;
         if(!inkA_state&&!inkB_state){combinedColor=averageColors(paperA,paperB);}else if(inkA_state&&!inkB_state){combinedColor=averageColors(inkA,paperB);}else if(!inkA_state&&inkB_state){combinedColor=averageColors(paperA,inkB);}else{combinedColor=averageColors(inkA,inkB);}
         Color ref=new Color(referencePixels[pixelIndex++]); totalErrorSq+=colorDistanceSq(combinedColor,ref); } } return totalErrorSq;
     }
    // --- END Added Interlace Helper Methods ---

    // --- Inner Classes ---
    // Preview Worker
    private class PreviewWorker extends SwingWorker<ImageProcessor, Void> { private final PreviewParameters params; private volatile Exception error = null; PreviewWorker(PreviewParameters params) { this.params = params; } @Override protected ImageProcessor doInBackground() throws Exception { long startTime = System.currentTimeMillis(); IJ.showStatus("Processing preview..."); ImageProcessor resultIp = null; ImageProcessor sourceCopy = params.sourceProcessor.duplicate(); try { processImage(sourceCopy, params.blockSizeX, params.blockSizeY, params.isInterlaceEnabled, params.ditheringMode, params.colorMode, params.activeDitherPalette, params.customPalette, params.paperA, params.inkA, params.paperB, params.inkB, params.ditheringLevel, params.brightness, params.contrast, params.gamma, params.brightAttributeThreshold); if (isCancelled()) { return null; } resultIp = sourceCopy; long endTime = System.currentTimeMillis(); IJ.log("Preview processed in " + (endTime - startTime) + " ms."); } catch (Exception e) { error = e; IJ.log("!!! EXCEPTION in PreviewWorker.doInBackground !!!"); e.printStackTrace(); throw e; } finally { IJ.showStatus("Preview ready."); } return resultIp; } @Override protected void done() { if (this != currentWorker) { return; } try { if (isCancelled()) { return; } ImageProcessor resultIp = get(); if (resultIp != null && previewImp != null && previewCanvas != null && paletteCanvas != null) { previewImp.setProcessor(resultIp); previewImp.updateAndDraw(); previewCanvas.repaint(); paletteCanvas.repaint(); } else if(error != null) { IJ.error("Preview Error", "Error during preview processing:\n" + error.getMessage()); } } catch (CancellationException ce) { } catch (Exception e) { error = e; IJ.log("!!! Error during preview task completion or UI update !!!"); e.printStackTrace(); IJ.error("Preview Error", "Error retrieving preview result or updating UI:\n" + e.getMessage()); } finally { if (currentWorker == this) { currentWorker = null; } } } } // End PreviewWorker class
    // Parameter object for the PreviewWorker
    private static class PreviewParameters { final ImageProcessor sourceProcessor; final int blockSizeX, blockSizeY; final DitheringMode ditheringMode; final ColorMode colorMode; final Color[] activeDitherPalette, customPalette; final double ditheringLevel, brightness, contrast, gamma, brightAttributeThreshold; final boolean isInterlaceEnabled; final UserColorSelection paperA, inkA, paperB, inkB; PreviewParameters(ImageProcessor s, int bx, int by, DitheringMode dm, ColorMode cm, Color[] ap, Color[] cp, double dl, double br, double co, double ga, double bt, boolean ie, UserColorSelection pa, UserColorSelection ia, UserColorSelection pb, UserColorSelection ib ) { sourceProcessor=s; blockSizeX=bx; blockSizeY=by; ditheringMode=dm; colorMode=cm; activeDitherPalette=ap; customPalette=cp; ditheringLevel=dl; brightness=br; contrast=co; gamma=ga; brightAttributeThreshold=bt; isInterlaceEnabled=ie; paperA=pa; inkA=ia; paperB=pb; inkB=ib; } } // End PreviewParameters class

    // --- Old Interlace Methods (Placeholder - TO BE REMOVED/REPLACED) ---
    /* BufferedImage interlacedDitherProcess(...) { ... } */
    /* private class ColorPair { ... } */
    /* private ColorPair findBestPalettePair(...) { ... } */
    /* private double luminance(...) { ... } */
    /* private float[][] getNormalizedBayerMatrix(...) { ... } */

} // End of ZX_Spectrum_Converter6 class
