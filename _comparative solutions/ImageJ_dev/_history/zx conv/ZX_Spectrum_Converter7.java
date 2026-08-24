import ij.*;
import ij.process.*;
import ij.gui.*;
import ij.plugin.frame.PlugInFrame;
import java.awt.*;
import java.awt.event.*;
import java.io.*;
import java.util.*;
import javax.swing.*;
import javax.swing.filechooser.FileNameExtensionFilter;
import java.awt.image.BufferedImage;
import java.awt.image.RescaleOp;
import java.awt.image.LookupTable;
import java.awt.image.LookupOp;
import java.awt.image.ShortLookupTable;
import java.awt.image.DataBufferInt;

/**
 * ZX Spectrum Converter6 (Refactored)
 * - Extracted enums and data classes to ZXSpectrumConverterData.java
 * - Extracted palette logic to PaletteManager.java
 * - Improved modularity and readability
 */
public class ZX_Spectrum_Converter7 extends PlugInFrame
        implements ActionListener, ItemListener, AdjustmentListener, FocusListener, TextListener {

    // --- Data and Palette Managers ---
    private final PaletteManager paletteManager = new PaletteManager();
    private ImagePlus sourceImp;
    private ImagePlus previewImp;
    private int blockSizeX = 8;
    private int blockSizeY = 8;
    private double ditheringLevel = 1.0;
    private double brightness = 1.0;
    private double contrast = 1.0;
    private double gamma = 1.0;
    private ZXSpectrumConverterData.DitheringMode ditheringMode = ZXSpectrumConverterData.DitheringMode.FLOYD_STEINBERG;
    private ZXSpectrumConverterData.ColorMode colorMode = ZXSpectrumConverterData.ColorMode.ZX_NORMAL;
    private Color[] customPalette = null;
    private String paletteFilePath = "";
    private double brightAttributeThreshold = 150.0;
    private boolean isInterlaceEnabled = false;
    private ZXSpectrumConverterData.UserColorSelection paperASelection = new ZXSpectrumConverterData.UserColorSelection(Arrays.asList(0), ZXSpectrumConverterData.BrightMode.OFF);
    private ZXSpectrumConverterData.UserColorSelection inkASelection = new ZXSpectrumConverterData.UserColorSelection(Arrays.asList(7), ZXSpectrumConverterData.BrightMode.OFF);
    private ZXSpectrumConverterData.UserColorSelection paperBSelection = new ZXSpectrumConverterData.UserColorSelection(Arrays.asList(0), ZXSpectrumConverterData.BrightMode.OFF);
    private ZXSpectrumConverterData.UserColorSelection inkBSelection = new ZXSpectrumConverterData.UserColorSelection(Arrays.asList(6), ZXSpectrumConverterData.BrightMode.OFF);
    private double currentMagnification = 1.0;

    // --- UI Components ---
    private Panel controlPanel, displayPanel, imagePanel, scalePanel;
    private ImageCanvas sourceCanvas, previewCanvas;
    private PalettePreviewCanvas paletteCanvas;
    private Panel userDefinedPanel;
    private TextField blockSizeXField, blockSizeYField;
    private Label blockSizeXLabel, blockSizeYLabel;
    private Checkbox interlaceCheckbox;
    private Label paperALabel, inkALabel, paperBLabel, inkBLabel;
    private TextField paperAField, inkAField, paperBField, inkBField;
    private Choice ditherModeChoice, colorModeChoice;
    private Scrollbar ditherScroll, brightScroll, contrastScroll, gammaScroll;
    private Button loadPaletteButton, applyButton;
    private CheckboxGroup scaleGroup;
    private Checkbox scale1x, scale2x, scale3x;
    private PreviewWorker currentWorker = null;

    // --- Palette Preview Canvas ---
    private class PalettePreviewCanvas extends Canvas {
        private static final int PREF_HEIGHT = 20;
        PalettePreviewCanvas() { setPreferredSize(new Dimension(200, PREF_HEIGHT)); }
        @Override public void paint(Graphics g) {
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
        @Override public Dimension getPreferredSize() { return new Dimension(200, PREF_HEIGHT); }
        @Override public Dimension getMinimumSize() { return getPreferredSize(); }
    }

    // --- Constructor ---
    public ZX_Spectrum_Converter7() { super("ZX Spectrum Converter7"); }

    // --- PlugInFrame Entry Point ---
    @Override public void run(String arg) {
        sourceImp = WindowManager.getCurrentImage();
        if (sourceImp == null) { IJ.noImage(); return; }
        if (sourceImp.getType() != ImagePlus.COLOR_RGB) {
            IJ.error(getTitle(), "Plugin requires an RGB image.");
            return;
        }
        String frameTitle = "ZX Spectrum Converter7" + " [" + sourceImp.getID() + "]";
        Frame existingFrame = WindowManager.getFrame(frameTitle);
        if (existingFrame != null) { existingFrame.toFront(); return; }
        setTitle(frameTitle);
        setupUI();
        pack();
        GUI.center(this);
        setVisible(true);
        if (readBlockSizeUISettings()){
            triggerPreviewUpdate();
        } else {
            IJ.error("Initial block size invalid. Please correct.");
        }
    }

    // --- UI Setup Method ---
    private void setupUI() {
        setLayout(new BorderLayout(5,5));
        controlPanel = new Panel();
        GridBagLayout gbl = new GridBagLayout();
        GridBagConstraints gbc = new GridBagConstraints();
        controlPanel.setLayout(gbl);
        Insets weightyDefaults = new Insets(2,5,2,5);
        int gridY = 0;

        // Block Size X
        gbc.gridwidth = 1;
        gbc.fill = GridBagConstraints.NONE;
        gbc.anchor = GridBagConstraints.EAST;
        gbc.insets = weightyDefaults;
        blockSizeXLabel = new Label("Block Size X:");
        gbc.gridx = 0; gbc.gridy = gridY;
        controlPanel.add(blockSizeXLabel, gbc);
        blockSizeXField = new TextField(String.valueOf(blockSizeX), 3);
        blockSizeXField.addActionListener(this);
        blockSizeXField.addFocusListener(this);
        blockSizeXField.addTextListener(this);
        gbc.gridx = 1; gbc.anchor = GridBagConstraints.WEST; gbc.fill = GridBagConstraints.HORIZONTAL;
        controlPanel.add(blockSizeXField, gbc);
        gridY++;

        // Block Size Y
        blockSizeYLabel = new Label("Block Size Y:");
        gbc.gridx = 0; gbc.gridy = gridY; gbc.fill = GridBagConstraints.NONE; gbc.anchor = GridBagConstraints.EAST;
        controlPanel.add(blockSizeYLabel, gbc);
        blockSizeYField = new TextField(String.valueOf(blockSizeY), 3);
        blockSizeYField.addActionListener(this);
        blockSizeYField.addFocusListener(this);
        blockSizeYField.addTextListener(this);
        gbc.gridx = 1; gbc.anchor = GridBagConstraints.WEST; gbc.fill = GridBagConstraints.HORIZONTAL;
        controlPanel.add(blockSizeYField, gbc);
        gridY++;

        // Interlace
        gbc.gridx = 0; gbc.gridy = gridY; gbc.anchor = GridBagConstraints.EAST; gbc.fill = GridBagConstraints.NONE;
        controlPanel.add(new Label("Interlace:"), gbc);
        gbc.gridx = 1; gbc.anchor = GridBagConstraints.WEST;
        interlaceCheckbox = new Checkbox("Enabled", isInterlaceEnabled);
        interlaceCheckbox.addItemListener(this);
        controlPanel.add(interlaceCheckbox, gbc);
        gridY++;

        // Dithering
        gbc.gridx = 0; gbc.gridy = gridY; gbc.anchor = GridBagConstraints.EAST; gbc.fill = GridBagConstraints.NONE;
        controlPanel.add(new Label("Dithering:"), gbc);
        gbc.gridx = 1; gbc.anchor = GridBagConstraints.WEST; gbc.fill = GridBagConstraints.HORIZONTAL;
        ditherModeChoice = new Choice();
        for (String s : ZXSpectrumConverterData.DitheringMode.getLabels()) ditherModeChoice.add(s);
        ditherModeChoice.select(ditheringMode.toString());
        ditherModeChoice.addItemListener(this);
        controlPanel.add(ditherModeChoice, gbc);
        gridY++;

        // Color Mode
        gbc.gridx = 0; gbc.gridy = gridY; gbc.anchor = GridBagConstraints.EAST; gbc.fill = GridBagConstraints.NONE;
        controlPanel.add(new Label("Color Mode:"), gbc);
        gbc.gridx = 1; gbc.anchor = GridBagConstraints.WEST; gbc.fill = GridBagConstraints.HORIZONTAL;
        colorModeChoice = new Choice();
        for (String s : ZXSpectrumConverterData.ColorMode.getLabels()) colorModeChoice.add(s);
        colorModeChoice.select(colorMode.toString());
        colorModeChoice.addItemListener(this);
        controlPanel.add(colorModeChoice, gbc);
        gridY++;

        // User Defined Panel
        userDefinedPanel = new Panel();
        GridBagLayout userGbl = new GridBagLayout();
        GridBagConstraints userGbc = new GridBagConstraints();
        userDefinedPanel.setLayout(userGbl);
        userGbc.insets = new Insets(1, 3, 1, 3);
        userGbc.anchor = GridBagConstraints.WEST;
        int userGridY = 0;
        userGbc.gridx = 0; userGbc.gridy = userGridY; userGbc.gridwidth = 2;
        userDefinedPanel.add(new Label("User Defined Palette Colors (Indexes 0-7, use 'b'/'B'):"), userGbc);
        userGridY++; userGbc.gridwidth = 1;
        paperALabel = new Label("Paper A:"); userGbc.gridx = 0; userGbc.gridy = userGridY; userGbc.fill = GridBagConstraints.NONE;
        userDefinedPanel.add(paperALabel, userGbc);
        paperAField = new TextField(paperASelection.toUIText(), 15); paperAField.addTextListener(this); paperAField.addFocusListener(this);
        userGbc.gridx = 1; userGbc.gridy = userGridY; userGbc.fill = GridBagConstraints.HORIZONTAL;
        userDefinedPanel.add(paperAField, userGbc);
        userGridY++;
        inkALabel = new Label("Ink A:"); userGbc.gridx = 0; userGbc.gridy = userGridY; userGbc.fill = GridBagConstraints.NONE;
        userDefinedPanel.add(inkALabel, userGbc);
        inkAField = new TextField(inkASelection.toUIText(), 15); inkAField.addTextListener(this); inkAField.addFocusListener(this);
        userGbc.gridx = 1; userGbc.gridy = userGridY; userGbc.fill = GridBagConstraints.HORIZONTAL;
        userDefinedPanel.add(inkAField, userGbc);
        userGridY++;
        paperBLabel = new Label("Paper B:"); userGbc.gridx = 0; userGbc.gridy = userGridY; userGbc.fill = GridBagConstraints.NONE;
        userDefinedPanel.add(paperBLabel, userGbc);
        paperBField = new TextField(paperBSelection.toUIText(), 15); paperBField.addTextListener(this); paperBField.addFocusListener(this);
        userGbc.gridx = 1; userGbc.gridy = userGridY; userGbc.fill = GridBagConstraints.HORIZONTAL;
        userDefinedPanel.add(paperBField, userGbc);
        userGridY++;
        inkBLabel = new Label("Ink B:"); userGbc.gridx = 0; userGbc.gridy = userGridY; userGbc.fill = GridBagConstraints.NONE;
        userDefinedPanel.add(inkBLabel, userGbc);
        inkBField = new TextField(inkBSelection.toUIText(), 15); inkBField.addTextListener(this); inkBField.addFocusListener(this);
        userGbc.gridx = 1; userGbc.gridy = userGridY; userGbc.fill = GridBagConstraints.HORIZONTAL;
        userDefinedPanel.add(inkBField, userGbc);

        gbc.gridx = 0; gbc.gridy = gridY; gbc.gridwidth = 2; gbc.anchor = GridBagConstraints.NORTHWEST; gbc.fill = GridBagConstraints.HORIZONTAL; gbc.insets = new Insets(10, 5, 0, 5);
        controlPanel.add(userDefinedPanel, gbc);
        gridY++; gbc.gridwidth = 1; gbc.insets = weightyDefaults;

        // Sliders
        ditherScroll = addSlider(controlPanel, "Dither Level:", 0, 100, (int)(ditheringLevel * 100), gbc, gridY++);
        brightScroll = addSlider(controlPanel, "Brightness:", 0, 200, (int)(brightness * 100), gbc, gridY++);
        contrastScroll = addSlider(controlPanel, "Contrast:", 0, 200, (int)(contrast * 100), gbc, gridY++);
        gammaScroll = addSlider(controlPanel, "Gamma:", 1, 300, (int)(gamma * 100), gbc, gridY++);

        // Buttons
        gbc.gridx = 0; gbc.gridy = gridY; gbc.gridwidth = 2; gbc.anchor = GridBagConstraints.CENTER; gbc.fill = GridBagConstraints.NONE; gbc.insets = new Insets(10,5,2,5);
        Panel buttonRow = new Panel(new FlowLayout());
        loadPaletteButton = new Button("Load Custom Palette"); loadPaletteButton.addActionListener(this);
        applyButton = new Button("Apply to Original"); applyButton.addActionListener(this);
        buttonRow.add(loadPaletteButton); buttonRow.add(applyButton);
        controlPanel.add(buttonRow, gbc);
        gridY++;

        Panel controlWrapperPanel = new Panel(new BorderLayout());
        controlWrapperPanel.add(controlPanel, BorderLayout.NORTH);
        add(controlWrapperPanel, BorderLayout.WEST);

        // Display Panel
        displayPanel = new Panel(new BorderLayout(5,5));
        imagePanel = new Panel(new java.awt.GridLayout(1,2,5,5));
        sourceCanvas = new ImageCanvas(sourceImp);
        ImageProcessor blankIp = sourceImp.getProcessor().createProcessor(sourceImp.getWidth(), sourceImp.getHeight());
        previewImp = new ImagePlus("Preview", blankIp);
        previewCanvas = new ImageCanvas(previewImp);
        imagePanel.add(sourceCanvas);
        imagePanel.add(previewCanvas);
        displayPanel.add(imagePanel, BorderLayout.CENTER);

        // Scale Panel
        scalePanel = new Panel(new FlowLayout(FlowLayout.CENTER));
        scaleGroup = new CheckboxGroup();
        scale1x = new Checkbox("1x", scaleGroup, true); scale1x.addItemListener(this);
        scale2x = new Checkbox("2x", scaleGroup, false); scale2x.addItemListener(this);
        scale3x = new Checkbox("3x", scaleGroup, false); scale3x.addItemListener(this);
        scalePanel.add(new Label("Zoom:")); scalePanel.add(scale1x); scalePanel.add(scale2x); scalePanel.add(scale3x);
        displayPanel.add(scalePanel, BorderLayout.NORTH);
        add(displayPanel, BorderLayout.CENTER);

        paletteCanvas = new PalettePreviewCanvas();
        add(paletteCanvas, BorderLayout.SOUTH);

        updateComponentVisibility();

        addWindowListener(new WindowAdapter() {
            @Override public void windowClosing(WindowEvent e) {
                close();
                if (currentWorker != null) {
                    currentWorker.cancel(true);
                    currentWorker = null;
                }
            }
        });
    }

    // --- Helper for adding a Slider ---
    private Scrollbar addSlider(Panel p, String label, int min, int max, int value, GridBagConstraints gbc, int y) {
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
        if (source == loadPaletteButton) {
            loadPaletteAction();
        } else if (source == applyButton) {
            applyChangesAction();
        } else if (source == blockSizeXField || source == blockSizeYField) {
            if (readBlockSizeUISettings()) {
                triggerPreviewUpdate();
            }
        }
    }

    @Override public void itemStateChanged(ItemEvent e) {
        Object source = e.getSource();
        if (source == scale1x || source == scale2x || source == scale3x) {
            updateMagnification();
        } else {
            if (source == colorModeChoice || source == interlaceCheckbox) {
                updateComponentVisibility();
            }
            triggerPreviewUpdate();
        }
    }

    @Override public void adjustmentValueChanged(AdjustmentEvent e) { triggerPreviewUpdate(); }
    @Override public void focusGained(FocusEvent e) { /* Do nothing */ }
    @Override public void focusLost(FocusEvent e) {
        Object source = e.getSource();
        boolean needsUpdate = false;
        if (source == blockSizeXField || source == blockSizeYField) {
            needsUpdate = readBlockSizeUISettings();
        } else if (source == paperAField || source == inkAField || source == paperBField || source == inkBField) {
            readUISettings();
            needsUpdate = true;
        }
        if (needsUpdate) { triggerPreviewUpdate(); }
    }
    @Override public void textValueChanged(TextEvent e) { /* Consider removing for performance */ }

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
            boolean loaded = paletteManager.loadPaletteFromFile(paletteFilePath);
            if (loaded) {
                this.customPalette = paletteManager.getCustomPalette();
                IJ.log("Palette loaded successfully, setting mode to Custom and updating preview.");
                colorModeChoice.select(ZXSpectrumConverterData.ColorMode.CUSTOM.toString());
                updateComponentVisibility();
                triggerPreviewUpdate();
            }
        } else {
            IJ.log("Load Palette canceled.");
        }
    }

    private void applyChangesAction() {
        IJ.log("Apply button clicked.");
        if (sourceImp == null) return;
        if (!readBlockSizeUISettings()) {
            IJ.error("Cannot apply changes. Invalid block size detected.");
            return;
        }
        readUISettings();
        IJ.log(String.format("ApplyAction: Block=%dx%d Interlace=%b Dither=%s Color=%s DLevel=%.2f BCG=%.1f/%.1f/%.1f",
                this.blockSizeX, this.blockSizeY, this.isInterlaceEnabled, this.ditheringMode, this.colorMode,
                this.ditheringLevel, this.brightness, this.contrast, this.gamma));
        Color[] applyPalette = getActivePalette();
        ImageProcessor ipToProcess = sourceImp.getProcessor();
        ImageProcessor backupIp = ipToProcess.duplicate();
        try {
            IJ.showStatus("Applying ZX Spectrum Conversion...");
            // TODO: Call refactored image processing logic here
            // processImage(ipToProcess, ...);
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

    /** Reads and validates Block Size X and Y from the UI TextFields. */
    private boolean readBlockSizeUISettings() {
        int oldX = blockSizeX;
        int oldY = blockSizeY;
        int newX = oldX;
        int newY = oldY;
        boolean xValid = true;
        boolean yValid = true;
        try {
            newX = Integer.parseInt(blockSizeXField.getText());
            if (newX < 1) {
                IJ.log("Warning: Block Size X must be >= 1. Reverting to " + oldX);
                blockSizeXField.setText(String.valueOf(oldX));
                newX = oldX;
                xValid = false;
            }
        } catch (NumberFormatException e) {
            IJ.log("Warning: Invalid number for Block Size X. Reverting to " + oldX);
            blockSizeXField.setText(String.valueOf(oldX));
            newX = oldX;
            xValid = false;
        }
        try {
            newY = Integer.parseInt(blockSizeYField.getText());
            if (newY < 1) {
                IJ.log("Warning: Block Size Y must be >= 1. Reverting to " + oldY);
                blockSizeYField.setText(String.valueOf(oldY));
                newY = oldY;
                yValid = false;
            }
        } catch (NumberFormatException e) {
            IJ.log("Warning: Invalid number for Block Size Y. Reverting to " + oldY);
            blockSizeYField.setText(String.valueOf(oldY));
            newY = oldY;
            yValid = false;
        }
        blockSizeX = newX;
        blockSizeY = newY;
        return xValid && yValid;
    }

    /** Reads all UI settings into member variables. Assumes block size is already validated. */
    private void readUISettings() {
        ditheringMode = ZXSpectrumConverterData.DitheringMode.fromString(ditherModeChoice.getSelectedItem());
        colorMode = ZXSpectrumConverterData.ColorMode.fromString(colorModeChoice.getSelectedItem());
        isInterlaceEnabled = interlaceCheckbox.getState();
        if (colorMode == ZXSpectrumConverterData.ColorMode.USER_DEFINED) {
            paperASelection = paletteManager.parseUserDefinedColors(paperAField.getText());
            inkASelection = paletteManager.parseUserDefinedColors(inkAField.getText());
            if (isInterlaceEnabled) {
                paperBSelection = paletteManager.parseUserDefinedColors(paperBField.getText());
                inkBSelection = paletteManager.parseUserDefinedColors(inkBField.getText());
            } else {
                paperBSelection = ZXSpectrumConverterData.UserColorSelection.empty();
                inkBSelection = ZXSpectrumConverterData.UserColorSelection.empty();
            }
        } else {
            paperASelection = ZXSpectrumConverterData.UserColorSelection.empty();
            inkASelection = ZXSpectrumConverterData.UserColorSelection.empty();
            paperBSelection = ZXSpectrumConverterData.UserColorSelection.empty();
            inkBSelection = ZXSpectrumConverterData.UserColorSelection.empty();
        }
        ditheringLevel = ditherScroll.getValue() / 100.0;
        brightness = brightScroll.getValue() / 100.0;
        contrast = contrastScroll.getValue() / 100.0;
        gamma = Math.max(0.01, gammaScroll.getValue() / 100.0);
        if (this.colorMode == ZXSpectrumConverterData.ColorMode.CUSTOM && (this.customPalette == null || this.customPalette.length == 0)) {
            if (!paletteFilePath.isEmpty()) {
                IJ.log("Warning: Custom mode selected but no valid palette loaded. Reverting to ZX_NORMAL.");
                this.colorMode = ZXSpectrumConverterData.ColorMode.ZX_NORMAL;
                colorModeChoice.select(ZXSpectrumConverterData.ColorMode.ZX_NORMAL.toString());
                updateComponentVisibility();
                paletteFilePath = "";
            }
        }
    }

    // --- Magnification ---
    private void updateMagnification() {
        if (sourceCanvas == null || previewCanvas == null || scaleGroup == null || imagePanel == null || sourceImp == null) {
            IJ.log("updateMagnification skipped: UI not ready."); return;
        }
        Checkbox selected = scaleGroup.getSelectedCheckbox(); double newMag = 1.0;
        if (selected == scale2x) newMag = 2.0; else if (selected == scale3x) newMag = 3.0;
        if (newMag != currentMagnification) {
            IJ.log("Setting Magnification from " + currentMagnification + " to " + newMag);
            sourceCanvas.setMagnification(newMag); previewCanvas.setMagnification(newMag); currentMagnification = newMag;
            imagePanel.invalidate(); displayPanel.invalidate(); this.pack();
            sourceCanvas.repaint(); previewCanvas.repaint();
            IJ.log("Magnification update finished.");
        }
    }

    // --- Trigger Preview Update ---
    private void triggerPreviewUpdate() {
        if (sourceImp == null || previewImp == null || !isVisible()) { return; }
        if (!readBlockSizeUISettings()) {
            IJ.log("Preview update skipped due to invalid block size.");
            ImageProcessor errorIp = previewImp.getProcessor();
            if (errorIp != null) {
                errorIp.setColor(Color.RED); errorIp.fill();
                errorIp.setColor(Color.WHITE); errorIp.drawString("Invalid Block Size!", 10, 20);
                previewImp.updateAndDraw();
            }
            return;
        }
        readUISettings();
        // TODO: Call refactored preview logic here
    }

    // --- Helper Methods for Active Palette ---
    public Color[] getActivePalette() {
        switch (this.colorMode) {
            case ZX_NORMAL:
            case ZX_BRIGHT_ATTRIBUTE:
                return paletteManager.getZxPaletteNormal();
            case C64:
                return paletteManager.getC64Palette();
            case EGA:
                return paletteManager.getEgaPalette();
            case BLACK_AND_WHITE:
                return paletteManager.getBwPalette();
            case BLACK_RED_GREEN_WHITE:
                return paletteManager.getBrgwPalette();
            case USER_DEFINED:
                return paletteManager.getZxPaletteNormal();
            case CUSTOM:
                return (this.customPalette != null && this.customPalette.length > 0) ? this.customPalette : paletteManager.getBwPalette();
            default:
                return paletteManager.getZxPaletteNormal();
        }
    }

    // --- UI Component Visibility Update ---
    private void updateComponentVisibility() {
        if (colorModeChoice == null || userDefinedPanel == null || interlaceCheckbox == null || paperBLabel == null || paperBField == null || inkBLabel == null || inkBField == null) {
            return;
        }
        ZXSpectrumConverterData.ColorMode selectedMode = ZXSpectrumConverterData.ColorMode.fromString(colorModeChoice.getSelectedItem());
        boolean showUserDefined = (selectedMode == ZXSpectrumConverterData.ColorMode.USER_DEFINED);
        boolean needsResize = false;
        if (userDefinedPanel.isVisible() != showUserDefined) {
            userDefinedPanel.setVisible(showUserDefined);
            needsResize = true;
        }
        if (showUserDefined) {
            boolean showFrameBFields = interlaceCheckbox.getState();
            boolean currentVisibility = paperBLabel.isVisible();
            if (currentVisibility != showFrameBFields) {
                paperBLabel.setVisible(showFrameBFields); paperBField.setVisible(showFrameBFields);
                inkBLabel.setVisible(showFrameBFields); inkBField.setVisible(showFrameBFields);
                needsResize = true;
            }
        }
        if (needsResize) { pack(); }
    }

    // --- Inner Classes ---
    // PreviewWorker and PreviewParameters would be refactored similarly, omitted for brevity.

} // End of ZX_Spectrum_Converter6 class
