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

import ij.process.ByteProcessor;
import ij.process.ImageConverter;
import ij.ImagePlus;
import ij.ImageStack;
import java.util.Comparator;

/**
 * ZX Spectrum Converter7
 * Version: ZX_Spectrum_Converter6 (Corrected Duplicates & Order - FINAL FINAL Attempt!)
 * Changes:
 * - Removed duplicate averageColors method.
 * - Ensured Bayer constants defined ONCE before methods using them.
 * - Ensured getBayerMatrix defined ONCE after constants and before its usage.
 * - Ensured clamp methods defined ONCE before use.
 * - (Includes previous fixes)
 */
public class ZX_Spectrum_Converter7 extends PlugInFrame
        implements ActionListener, ItemListener, AdjustmentListener, FocusListener, TextListener {

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
            return Arrays.stream(DitheringMode.values()).map(DitheringMode::toString).toArray(String[]::new); 
        } 
        
        public static DitheringMode fromString(String text) { 
            for (DitheringMode mode : DitheringMode.values()) { 
                if (mode.label.equalsIgnoreCase(text)) return mode; 
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
        
        public boolean isErrorDiffusion() { 
            return this == FLOYD_STEINBERG || this == ATKINSON || this == JARVIS_JUDICE_NINKE; 
        } 
    }
    
    private enum ColorMode { 
        ZX_NORMAL("ZX Spectrum (Normal)"), 
        ZX_BRIGHT_ATTRIBUTE("ZX Spectrum (Bright Attribute)"), 
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
            return Arrays.stream(ColorMode.values()).map(ColorMode::toString).toArray(String[]::new); 
        } 
        
        public static ColorMode fromString(String text) { 
            for (ColorMode mode : ColorMode.values()) { 
                if (mode.label.equalsIgnoreCase(text)) return mode; 
            } 
            return ZX_NORMAL; 
        } 
    }
    
    private enum BrightMode { OFF, ALLOWED, FORCED }
    
    private static class UserColorSelection { 
        final java.util.List<Integer> indexes; 
        final BrightMode brightMode; 
        
        UserColorSelection(java.util.List<Integer> indexes, BrightMode brightMode) { 
            this.indexes = (indexes != null) ? indexes : new java.util.ArrayList<>(); 
            this.brightMode = (brightMode != null) ? brightMode : BrightMode.OFF; 
        } 
        
        static UserColorSelection empty() { 
            return new UserColorSelection(new java.util.ArrayList<>(), BrightMode.OFF); 
        } 
        
        String toUIText() { 
            StringBuilder sb = new StringBuilder(); 
            for (int i = 0; i < indexes.size(); i++) { 
                sb.append(indexes.get(i)); 
                if (i < indexes.size() - 1) sb.append(","); 
            } 
            if (brightMode == BrightMode.ALLOWED) sb.append("b"); 
            else if (brightMode == BrightMode.FORCED) sb.append("B"); 
            return sb.toString(); 
        } 
        
        @Override public String toString() { 
            return "Indexes: " + indexes + ", Bright: " + brightMode; 
        } 
    }

    // --- Palettes ---
    private final Color[] zxPaletteNormal = { 
        new Color(0, 0, 0), 
        new Color(0, 0, 192), 
        new Color(192, 0, 0), 
        new Color(192, 0, 192), 
        new Color(0, 192, 0), 
        new Color(0, 192, 192), 
        new Color(192, 192, 0), 
        new Color(192, 192, 192) 
    };
    
    private final Color[] zxPaletteBright = { 
        new Color(0, 0, 0), 
        new Color(0, 0, 255), 
        new Color(255, 0, 0), 
        new Color(255, 0, 255), 
        new Color(0, 255, 0), 
        new Color(0, 255, 255), 
        new Color(255, 255, 0), 
        new Color(255, 255, 255) 
    };
    
    private final Color[] c64Palette = { 
        new Color(0,0,0), new Color(255,255,255), new Color(136,0,0), new Color(170,255,238), 
        new Color(204,68,204), new Color(0,204,85), new Color(0,0,170), new Color(238,238,119), 
        new Color(221,136,85), new Color(102,68,0), new Color(255,119,119), new Color(51,51,51), 
        new Color(119,119,119), new Color(170,255,102), new Color(0,119,221), new Color(187,187,187) 
    };
    
    private final Color[] egaPalette = { 
        new Color(0,0,0), new Color(0,0,170), new Color(0,170,0), new Color(0,170,170), 
        new Color(170,0,0), new Color(170,0,170), new Color(170,85,0), new Color(170,170,170), 
        new Color(85,85,85), new Color(85,85,255), new Color(85,255,85), new Color(85,255,255), 
        new Color(255,85,85), new Color(255,85,255), new Color(255,255,85), new Color(255,255,255) 
    };
    
    private final Color[] bwPalette = { 
        new Color(0, 0, 0), 
        new Color(255, 255, 255) 
    };
    
    private final Color[] brgwPalette = { 
        new Color(0, 0, 0), 
        new Color(255, 0, 0), 
        new Color(0, 255, 0), 
        new Color(255, 255, 255) 
    };

    // --- Bayer Matrix constants (DEFINED ONCE HERE) ---
    private static final int[][] BAYER_MATRIX_2X2 = { {0,2}, {3,1} };
    private static final int[][] BAYER_MATRIX_4X4 = { 
        {0,8,2,10}, 
        {12,4,14,6}, 
        {3,11,1,9}, 
        {15,7,13,5} 
    };
    
    private static final int[][] BAYER_MATRIX_8X8 = {
        { 0,32, 8,40, 2,34,10,42}, 
        {48,16,56,24,50,18,58,26}, 
        {12,44, 4,36,14,46, 6,38}, 
        {60,28,52,20,62,30,54,22},
        { 3,35,11,43, 1,33, 9,41}, 
        {51,19,59,27,49,17,57,25}, 
        {15,47, 7,39,13,45, 5,37}, 
        {63,31,55,23,61,29,53,21} 
    };
    // --- End Bayer Matrix constants ---

    // Lab lookup tables
    private float[][] paletteLab;   // [paletteSize][3] Lab entries
    private float[]   Lbuf, abuf, bbuf;  // flattened L*, a*, b* buffers
    private int       imgW = 0, imgH = 0;
    private int       K    = 4;         // number of candidates per block
    private BufferedImage labSource = null;

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
    private boolean isInterlaceEnabled = false; 
    private UserColorSelection paperASelection = new UserColorSelection(Arrays.asList(0), BrightMode.OFF); 
    private UserColorSelection inkASelection = new UserColorSelection(Arrays.asList(7), BrightMode.OFF); 
    private UserColorSelection paperBSelection = new UserColorSelection(Arrays.asList(0), BrightMode.OFF); 
    private UserColorSelection inkBSelection = new UserColorSelection(Arrays.asList(6), BrightMode.OFF); 
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

    // --- Concurrency ---
    private PreviewWorker currentWorker = null;

    // --- Custom Canvas for Palette Preview ---
    private class PalettePreviewCanvas extends Canvas { 
        private static final int PREF_HEIGHT = 20; 
        
        PalettePreviewCanvas() { 
            setPreferredSize(new Dimension(200, PREF_HEIGHT)); 
        } 
        
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
        
        @Override public Dimension getPreferredSize() { 
            return new Dimension(200, PREF_HEIGHT); 
        } 
        
        @Override public Dimension getMinimumSize() { 
            return getPreferredSize(); 
        } 
    }

    // --- Constructor ---
    public ZX_Spectrum_Converter7() { 
        super("ZX Spectrum Converter7"); 
    }

    // --- PlugInFrame Entry Point ---
    @Override public void run(String arg) { 
        sourceImp = WindowManager.getCurrentImage(); 
        if (sourceImp == null) { 
            IJ.noImage(); 
            return; 
        } 
        
        if (sourceImp.getType() != ImagePlus.COLOR_RGB) { 
            IJ.error(getTitle(), "Plugin requires an RGB image."); 
            return; 
        } 
        
        String frameTitle = "ZX Spectrum Converter7" + " [" + sourceImp.getID() + "]"; 
        Frame existingFrame = WindowManager.getFrame(frameTitle); 
        if (existingFrame != null) { 
            existingFrame.toFront(); 
            return; 
        } 
        
        setTitle(frameTitle); 
        setupUI(); 
        pack(); 
        GUI.center(this); 
        setVisible(true); 
        
        if (readBlockSizeUISettings()) { 
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
        
        gbc.gridwidth = 1; 
        gbc.fill = GridBagConstraints.NONE; 
        gbc.anchor = GridBagConstraints.EAST; 
        gbc.insets = weightyDefaults; 
        
        blockSizeXLabel = new Label("Block Size X:"); 
        gbc.gridx = 0; 
        gbc.gridy = gridY; 
        controlPanel.add(blockSizeXLabel, gbc); 
        
        blockSizeXField = new TextField(String.valueOf(blockSizeX), 3); 
        blockSizeXField.addActionListener(this); 
        blockSizeXField.addFocusListener(this); 
        blockSizeXField.addTextListener(this); 
        gbc.gridx = 1; 
        gbc.anchor = GridBagConstraints.WEST; 
        gbc.fill = GridBagConstraints.HORIZONTAL; 
        controlPanel.add(blockSizeXField, gbc); 
        gridY++; 
        
        blockSizeYLabel = new Label("Block Size Y:"); 
        gbc.gridx = 0; 
        gbc.gridy = gridY; 
        gbc.fill = GridBagConstraints.NONE; 
        gbc.anchor = GridBagConstraints.EAST; 
        controlPanel.add(blockSizeYLabel, gbc); 
        
        blockSizeYField = new TextField(String.valueOf(blockSizeY), 3); 
        blockSizeYField.addActionListener(this); 
        blockSizeYField.addFocusListener(this); 
        blockSizeYField.addTextListener(this); 
        gbc.gridx = 1; 
        gbc.anchor = GridBagConstraints.WEST; 
        gbc.fill = GridBagConstraints.HORIZONTAL; 
        controlPanel.add(blockSizeYField, gbc); 
        gridY++; 
        
        gbc.gridx = 0; 
        gbc.gridy = gridY; 
        gbc.anchor = GridBagConstraints.EAST; 
        gbc.fill = GridBagConstraints.NONE; 
        controlPanel.add(new Label("Interlace:"), gbc); 
        
        gbc.gridx = 1; 
        gbc.anchor = GridBagConstraints.WEST; 
        interlaceCheckbox = new Checkbox("Enabled", isInterlaceEnabled); 
        interlaceCheckbox.addItemListener(this); 
        controlPanel.add(interlaceCheckbox, gbc); 
        gridY++; 
        
        gbc.gridx = 0; 
        gbc.gridy = gridY; 
        gbc.anchor = GridBagConstraints.EAST; 
        gbc.fill = GridBagConstraints.NONE; 
        controlPanel.add(new Label("Dithering:"), gbc); 
        
        gbc.gridx = 1; 
        gbc.anchor = GridBagConstraints.WEST; 
        gbc.fill = GridBagConstraints.HORIZONTAL; 
        ditherModeChoice = new Choice(); 
        for (String s : DitheringMode.getLabels()) ditherModeChoice.add(s); 
        ditherModeChoice.select(ditheringMode.toString()); 
        ditherModeChoice.addItemListener(this); 
        controlPanel.add(ditherModeChoice, gbc); 
        gridY++; 
        
        gbc.gridx = 0; 
        gbc.gridy = gridY; 
        gbc.anchor = GridBagConstraints.EAST; 
        gbc.fill = GridBagConstraints.NONE; 
        controlPanel.add(new Label("Color Mode:"), gbc); 
        
        gbc.gridx = 1; 
        gbc.anchor = GridBagConstraints.WEST; 
        gbc.fill = GridBagConstraints.HORIZONTAL; 
        colorModeChoice = new Choice(); 
        for (String s : ColorMode.getLabels()) colorModeChoice.add(s); 
        colorModeChoice.select(colorMode.toString()); 
        colorModeChoice.addItemListener(this); 
        controlPanel.add(colorModeChoice, gbc); 
        gridY++; 
        
        userDefinedPanel = new Panel(); 
        GridBagLayout userGbl = new GridBagLayout(); 
        GridBagConstraints userGbc = new GridBagConstraints(); 
        userDefinedPanel.setLayout(userGbl); 
        userGbc.insets = new Insets(1, 3, 1, 3); 
        userGbc.anchor = GridBagConstraints.WEST; 
        int userGridY = 0; 
        
        userGbc.gridx = 0; 
        userGbc.gridy = userGridY; 
        userGbc.gridwidth = 2; 
        userDefinedPanel.add(new Label("User Defined Palette Colors (Indexes 0-7, use 'b'/'B'):"), userGbc); 
        userGridY++; 
        
        userGbc.gridwidth = 1; 
        paperALabel = new Label("Paper A:"); 
        userGbc.gridx = 0; 
        userGbc.gridy = userGridY; 
        userGbc.fill = GridBagConstraints.NONE; 
        userDefinedPanel.add(paperALabel, userGbc); 
        
        paperAField = new TextField(paperASelection.toUIText(), 15); 
        paperAField.addTextListener(this); 
        paperAField.addFocusListener(this); 
        userGbc.gridx = 1; 
        userGbc.gridy = userGridY; 
        userGbc.fill = GridBagConstraints.HORIZONTAL; 
        userDefinedPanel.add(paperAField, userGbc); 
        userGridY++; 
        
        inkALabel = new Label("Ink A:"); 
        userGbc.gridx = 0; 
        userGbc.gridy = userGridY; 
        userGbc.fill = GridBagConstraints.NONE; 
        userDefinedPanel.add(inkALabel, userGbc); 
        
        inkAField = new TextField(inkASelection.toUIText(), 15); 
        inkAField.addTextListener(this); 
        inkAField.addFocusListener(this); 
        userGbc.gridx = 1; 
        userGbc.gridy = userGridY; 
        userGbc.fill = GridBagConstraints.HORIZONTAL; 
        userDefinedPanel.add(inkAField, userGbc); 
        userGridY++; 
        
        paperBLabel = new Label("Paper B:"); 
        userGbc.gridx = 0; 
        userGbc.gridy = userGridY; 
        userGbc.fill = GridBagConstraints.NONE; 
        userDefinedPanel.add(paperBLabel, userGbc); 
        
        paperBField = new TextField(paperBSelection.toUIText(), 15); 
        paperBField.addTextListener(this); 
        paperBField.addFocusListener(this); 
        userGbc.gridx = 1; 
        userGbc.gridy = userGridY; 
        userGbc.fill = GridBagConstraints.HORIZONTAL; 
        userDefinedPanel.add(paperBField, userGbc); 
        userGridY++; 
        
        inkBLabel = new Label("Ink B:"); 
        userGbc.gridx = 0; 
        userGbc.gridy = userGridY; 
        userGbc.fill = GridBagConstraints.NONE; 
        userDefinedPanel.add(inkBLabel, userGbc); 
        
        inkBField = new TextField(inkBSelection.toUIText(), 15); 
        inkBField.addTextListener(this); 
        inkBField.addFocusListener(this); 
        userGbc.gridx = 1; 
        userGbc.gridy = userGridY; 
        userGbc.fill = GridBagConstraints.HORIZONTAL; 
        userDefinedPanel.add(inkBField, userGbc); 
        
        gbc.gridx = 0; 
        gbc.gridy = gridY; 
        gbc.gridwidth = 2; 
        gbc.anchor = GridBagConstraints.NORTHWEST; 
        gbc.fill = GridBagConstraints.HORIZONTAL; 
        gbc.insets = new Insets(10, 5, 0, 5); 
        controlPanel.add(userDefinedPanel, gbc); 
        gridY++; 
        
        gbc.gridwidth = 1; 
        gbc.insets = weightyDefaults; 
        ditherScroll = addSlider(controlPanel, "Dither Level:", 0, 100, (int)(ditheringLevel * 100), gbc, gridY++); 
        brightScroll = addSlider(controlPanel, "Brightness:", 0, 200, (int)(brightness * 100), gbc, gridY++); 
        contrastScroll = addSlider(controlPanel, "Contrast:", 0, 200, (int)(contrast * 100), gbc, gridY++); 
        gammaScroll = addSlider(controlPanel, "Gamma:", 1, 300, (int)(gamma * 100), gbc, gridY++); 
        
        gbc.gridx = 0; 
        gbc.gridy = gridY; 
        gbc.gridwidth = 2; 
        gbc.anchor = GridBagConstraints.CENTER; 
        gbc.fill = GridBagConstraints.NONE; 
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
        
        displayPanel = new Panel(new BorderLayout(5,5)); 
        imagePanel = new Panel(new java.awt.GridLayout(1,2,5,5)); 
        sourceCanvas = new ImageCanvas(sourceImp); 
        ImageProcessor blankIp = sourceImp.getProcessor().createProcessor(sourceImp.getWidth(), sourceImp.getHeight()); 
        previewImp = new ImagePlus("Preview", blankIp); 
        previewCanvas = new ImageCanvas(previewImp); 
        imagePanel.add(sourceCanvas); 
        imagePanel.add(previewCanvas); 
        displayPanel.add(imagePanel, BorderLayout.CENTER); 
        
        scalePanel = new Panel(new FlowLayout(FlowLayout.CENTER)); 
        scaleGroup = new CheckboxGroup(); 
        scale1x = new Checkbox("1x", scaleGroup, true); 
        scale1x.addItemListener(this); 
        scale2x = new Checkbox("2x", scaleGroup, false); 
        scale2x.addItemListener(this); 
        scale3x = new Checkbox("3x", scaleGroup, false); 
        scale3x.addItemListener(this); 
        scalePanel.add(new Label("Zoom:")); 
        scalePanel.add(scale1x); 
        scalePanel.add(scale2x); 
        scalePanel.add(scale3x); 
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
        gbc.gridx = 0; 
        gbc.gridy = y; 
        gbc.anchor = GridBagConstraints.EAST; 
        gbc.fill = GridBagConstraints.NONE; 
        p.add(new Label(label), gbc); 
        
        gbc.gridx = 1; 
        gbc.anchor = GridBagConstraints.WEST; 
        gbc.fill = GridBagConstraints.HORIZONTAL; 
        gbc.weightx = 1.0; 
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

    @Override
    public void adjustmentValueChanged(AdjustmentEvent e) {
        // If it was brightness, contrast or gamma:
        if (e.getSource() == brightScroll
         || e.getSource() == contrastScroll
         || e.getSource() == gammaScroll) {
            Lbuf = abuf = bbuf = null;
        }
        triggerPreviewUpdate();
    }

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
        if (needsUpdate) { 
            triggerPreviewUpdate(); 
        } 
    }
    
    @Override public void textValueChanged(TextEvent e) { /* Do nothing */ }

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
        } else { 
            IJ.log("Load Palette canceled."); 
        } 
    }

    /**
     * Called when the "Apply to Original" button is clicked.
     * Applies the current settings (interlace, dithering, palette, BCG) to the source image.
     */
    private void applyChangesAction() {
        IJ.log("Apply button clicked.");

        // No image open?
        if (sourceImp == null) {
            IJ.error("No source image available.");
            return;
        }

        // Validate block size
        if (!readBlockSizeUISettings()) {
            IJ.error("Cannot apply changes. Invalid block size detected.");
            return;
        }

        // Read all UI settings (dither mode, palette, interlace flag, B/C/G, etc.)
        readUISettings();

        // Log the settings we're about to apply
        IJ.log(String.format(
            "ApplyAction: Block=%dx%d  Interlace=%b  Dither=%s  Color=%s  DLevel=%.2f  B/C/G=%.2f/%.2f/%.2f",
            blockSizeX, blockSizeY,
            isInterlaceEnabled,
            ditheringMode,
            colorMode,
            ditheringLevel,
            brightness, contrast, gamma
        ));

        // If using USER_DEFINED palette, log the selections
        if (colorMode == ColorMode.USER_DEFINED) {
            IJ.log(" Apply User Defined: "
                + "PaperA=" + paperASelection
                + " InkA="   + inkASelection
                + (isInterlaceEnabled
                    ? ("  PaperB=" + paperBSelection + " InkB=" + inkBSelection)
                    : "")
            );
        }

        // Determine which palette to apply
        Color[] applyPalette = getActivePalette();

        // Backup the current processor in case of error
        ImageProcessor ipToProcess = sourceImp.getProcessor();
        ImageProcessor backupIp   = ipToProcess.duplicate();

        try {
            IJ.showStatus("Applying ZX Spectrum Conversion...");
            // Core processing method (will call processInterlaceModeNew or convertToZXSpectrum)
            processImage(
                ipToProcess,
                blockSizeX, blockSizeY,
                isInterlaceEnabled,
                ditheringMode,
                colorMode,
                applyPalette,
                customPalette,
                paperASelection,
                inkASelection,
                paperBSelection,
                inkBSelection,
                ditheringLevel,
                brightness,
                contrast,
                gamma,
                brightAttributeThreshold
            );
            // Update the display
            sourceImp.updateAndDraw();
            IJ.showStatus("Applied ZX Spectrum Conversion.");
        }
        catch (Exception e) {
            // Show an error dialog and restore original image data
            IJ.error("Error applying changes: " + e.getMessage());
            sourceImp.setProcessor(backupIp);
            sourceImp.updateAndDraw();
            IJ.showStatus("Error applying changes. Original restored.");
            // Print full stack trace to the Log window / console
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
        ditheringMode = DitheringMode.fromString(ditherModeChoice.getSelectedItem()); 
        colorMode = ColorMode.fromString(colorModeChoice.getSelectedItem()); 
        isInterlaceEnabled = interlaceCheckbox.getState(); 
        
        if (colorMode == ColorMode.USER_DEFINED) { 
            paperASelection = parseUserDefinedColors(paperAField.getText()); 
            inkASelection = parseUserDefinedColors(inkAField.getText()); 
            if (isInterlaceEnabled) { 
                paperBSelection = parseUserDefinedColors(paperBField.getText()); 
                inkBSelection = parseUserDefinedColors(inkBField.getText()); 
            } else { 
                paperBSelection = UserColorSelection.empty(); 
                inkBSelection = UserColorSelection.empty(); 
            } 
        } else { 
            paperASelection = UserColorSelection.empty(); 
            inkASelection = UserColorSelection.empty(); 
            paperBSelection = UserColorSelection.empty(); 
            inkBSelection = UserColorSelection.empty(); 
        } 
        
        ditheringLevel = ditherScroll.getValue() / 100.0; 
        brightness = brightScroll.getValue() / 100.0; 
        contrast = contrastScroll.getValue() / 100.0; 
        gamma = Math.max(0.01, gammaScroll.getValue() / 100.0); 
        
        if (this.colorMode == ColorMode.CUSTOM && (this.customPalette == null || this.customPalette.length == 0)) { 
            if (!paletteFilePath.isEmpty()) { 
                IJ.log("Warning: Custom mode selected but no valid palette loaded. Reverting to ZX_NORMAL."); 
                this.colorMode = ColorMode.ZX_NORMAL; 
                colorModeChoice.select(ColorMode.ZX_NORMAL.toString()); 
                updateComponentVisibility(); 
                paletteFilePath = ""; 
            } 
        } 
    }

    /** Parses the user input string for color indexes and bright mode flags. */
    private UserColorSelection parseUserDefinedColors(String text) { 
        java.util.List<Integer> indexes = new java.util.ArrayList<>(); 
        BrightMode brightMode = BrightMode.OFF; 
        boolean foundB_lower = false; 
        boolean foundB_upper = false; 
        
        if (text != null && !text.trim().isEmpty()) { 
            if (text.contains("B")) { 
                foundB_upper = true; 
            } else if (text.contains("b")) { 
                foundB_lower = true; 
            } 
            
            String cleanText = text; 
            if (foundB_upper) cleanText = cleanText.replace('B', ','); 
            if (foundB_lower) cleanText = cleanText.replace('b', ','); 
            
            String[] parts = cleanText.replaceAll("[^0-7,]", "").split(","); 
            for (String part : parts) { 
                part = part.trim(); 
                if (!part.isEmpty()) { 
                    try { 
                        int index = Integer.parseInt(part); 
                        if (index >= 0 && index <= 7) { 
                            indexes.add(index); 
                        } 
                    } catch (NumberFormatException e) { 
                        // Ignore invalid numbers
                    } 
                } 
            } 
        } 
        
        if (foundB_upper) brightMode = BrightMode.FORCED; 
        else if (foundB_lower) brightMode = BrightMode.ALLOWED; 
        
        java.util.List<Integer> uniqueIndexes = new java.util.ArrayList<>(new LinkedHashSet<>(indexes)); 
        return new UserColorSelection(uniqueIndexes, brightMode); 
    }

    /** Determines the effective BrightMode for a block based on Paper and Ink selections. */
    private BrightMode determineBlockBrightMode(UserColorSelection paperSelection, UserColorSelection inkSelection) { 
        if (paperSelection.brightMode == BrightMode.FORCED || inkSelection.brightMode == BrightMode.FORCED) { 
            return BrightMode.FORCED; 
        } else if (paperSelection.brightMode == BrightMode.ALLOWED || inkSelection.brightMode == BrightMode.ALLOWED) { 
            return BrightMode.ALLOWED; 
        } else { 
            return BrightMode.OFF; 
        } 
    }

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
            sourceCanvas.setMagnification(newMag); 
            previewCanvas.setMagnification(newMag);
            currentMagnification = newMag;
            
            int newCanvasWidth = (int)(sourceImp.getWidth()*newMag); 
            int newCanvasHeight = (int)(sourceImp.getHeight()*newMag);
            Dimension newSize = new Dimension(newCanvasWidth, newCanvasHeight);
            
            sourceCanvas.setPreferredSize(newSize); 
            sourceCanvas.setSize(newSize);
            previewCanvas.setPreferredSize(newSize); 
            previewCanvas.setSize(newSize);
            
            sourceCanvas.revalidate(); 
            previewCanvas.revalidate(); 
            imagePanel.revalidate(); 
            displayPanel.revalidate();
            
            this.pack();
            
            sourceCanvas.repaint(); 
            previewCanvas.repaint(); 
            imagePanel.repaint();
        }
    }
    // --- END ORIGINAL updateMagnification ---

    /**
     * Schedules (or restarts) the preview worker to update the right-hand preview pane.
     */
    private void triggerPreviewUpdate() {
        // Nothing to do if no image or plugin UI is closed
        if (sourceImp == null || previewImp == null || !isVisible()) {
            return;
        }

        // Validate block size first
        if (!readBlockSizeUISettings()) {
            IJ.log("Preview update skipped due to invalid block size.");
            ImageProcessor errorIp = previewImp.getProcessor();
            if (errorIp != null) {
                errorIp.setColor(Color.RED);
                errorIp.fill();
                errorIp.setColor(Color.WHITE);
                errorIp.drawString("Invalid Block Size!", 10, 20);
                previewImp.updateAndDraw();
            }
            return;
        }

        // Read all the UI settings into member variables
        readUISettings();

        // Determine the palette to use for dithering
        Color[] ditherPal = getActivePalette();
        if (colorMode == ColorMode.USER_DEFINED) {
            ditherPal = zxPaletteNormal;
            if (paperASelection.indexes.isEmpty() && inkASelection.indexes.isEmpty()) {
                ditherPal = bwPalette;
            }
        } else if (colorMode == ColorMode.CUSTOM) {
            ditherPal = this.customPalette;
            if (ditherPal == null || ditherPal.length == 0) {
                ditherPal = bwPalette;
            }
        }

        // Build the preview parameters object
        PreviewParameters params = new PreviewParameters(
            sourceImp.getProcessor(),
            blockSizeX, blockSizeY,
            ditheringMode, colorMode,
            ditherPal, customPalette,
            ditheringLevel,
            brightness, contrast, gamma,
            brightAttributeThreshold,
            isInterlaceEnabled,
            paperASelection, inkASelection,
            paperBSelection, inkBSelection
        );

        // Cancel any running preview worker
        if (currentWorker != null && !currentWorker.isDone()) {
            IJ.log("Cancelling previous preview worker (Hash: " + currentWorker.hashCode() + ")");
            currentWorker.cancel(true);
        }

        IJ.log("Starting new preview worker...");

        // Create and execute a new SwingWorker for the preview
        currentWorker = new PreviewWorker(params) {
            @Override
            protected void done() {
                try {
                    super.done();
                } catch (Exception e) {
                    IJ.log("Exception in preview worker:");
                    e.printStackTrace();
                }
            }
        };
        currentWorker.execute();
    }

    // --- clamp methods (DEFINED ONCE HERE) ---
    int clamp(float value) { return Math.max(0, Math.min(255, (int)(value + 0.5f))); }
    int clamp(int value) { return Math.max(0, Math.min(255, value)); }
    // --- END clamp ---

    // --- BCG Methods ---
    BufferedImage applyBCG(BufferedImage img, double brightnessParam, double contrastParam, double gammaParam) { 
        float cF=(float)contrastParam;
        float off=(float)(128.0*(1.0-cF)+255.0*(brightnessParam-1.0));
        RescaleOp rO=new RescaleOp(cF,off,null);
        BufferedImage cBI=rO.filter(img,null);
        
        if(Math.abs(gammaParam-1.0)>1e-6){
            LookupTable lT=createGammaLookupTable(gammaParam);
            LookupOp gO=new LookupOp(lT,null);
            return gO.filter(cBI,null);
        } else {
            return cBI;
        } 
    }
    
    LookupTable createGammaLookupTable(double ga) { 
        if(ga<=0) ga=0.01;
        short[] gL=new short[256];
        double exp=1.0/ga;
        for(int i=0;i<256;i++) {
            gL[i]=(short)Math.min(255,(int)(255.0*Math.pow(i/255.0,exp)+0.5));
        }
        
        short[][] lD=new short[3][256];
        for(int i=0;i<3;i++) {
            System.arraycopy(gL,0,lD[i],0,256);
        }
        return new ShortLookupTable(0,lD); 
    }

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

    /**
     * Dispatch all dithering through CIELAB-based routines.
     */
    BufferedImage applyDithering(BufferedImage image,
                               DitheringMode mode,
                               Color[] paletteForDithering,
                               double level)
    {
        // 0) make sure our Lab buffers and paletteLab exist
        if (labSource != image) {
            labSource = image;
            ensureLabBuffers(image);
            computePaletteLab(paletteForDithering);
        }

        // fallback if palette empty
        if (paletteForDithering == null || paletteForDithering.length == 0) {
            IJ.log("Warning: applyDithering palette empty. Using B&W.");
            paletteForDithering = bwPalette;
            computePaletteLab(paletteForDithering);
        }

        // pick mode
        if (level <= 0) mode = null;
        DitheringMode m = (mode != null) ? mode : DitheringMode.FLOYD_STEINBERG;

        // dispatch
        switch (m) {
            case FLOYD_STEINBERG:
            case ATKINSON:
            case JARVIS_JUDICE_NINKE:
                return labErrorDiffusion(image, m, paletteForDithering, level);

            case BAYER_2X2:
            case BAYER_4X4:
            case BAYER_8X8:
                return labOrderedDither(image, m.getBayerSize(), paletteForDithering, level);

            case HALFTONE:
                return labOrderedDither(image, 2, paletteForDithering, level);

            default:
                // fall through to plain quantize
        }

        // plain quantize:
        int W = imgW, H = imgH;
        BufferedImage q = new BufferedImage(W, H, BufferedImage.TYPE_INT_RGB);
        for (int y = 0; y < H; y++) {
            for (int x = 0; x < W; x++) {
                int idxLab = y * W + x;
                float Lc = Lbuf [idxLab];
                float ac = abuf [idxLab];
                float bc = bbuf [idxLab];

                // find best paletteLab[i] ...
                int bestI = 0;
                float bestD = Float.MAX_VALUE;
                for (int i = 0; i < paletteLab.length; i++) {
                    float dL = Lc - paletteLab[i][0];
                    float da = ac - paletteLab[i][1];
                    float db = bc - paletteLab[i][2];
                    float d  = dL*dL + da*da + db*db;
                    if (d < bestD) {
                        bestD = d;
                        bestI = i;
                    }
                }
                q.setRGB(x, y, paletteForDithering[bestI].getRGB());
            }
        }
        return q;
    }

    // --- Specific Dithering Algorithms ---
    BufferedImage floydSteinbergDitherProcess(BufferedImage image, Color[] targetPalette, double ditherLevelParam) { 
        int w=image.getWidth(),h=image.getHeight();
        float dF=(float)ditherLevelParam;
        float[] eR=new float[w],eG=new float[w],eB=new float[w],nER=new float[w],nEG=new float[w],nEB=new float[w];
        
        for(int y=0;y<h;y++){
            Arrays.fill(nER,0f);
            Arrays.fill(nEG,0f);
            Arrays.fill(nEB,0f);
            float pER=0,pEG=0,pEB=0;
            
            for(int x=0;x<w;x++){
                Color oC=new Color(image.getRGB(x,y));
                int oR=clamp(oC.getRed()+(int)(eR[x]+pER+0.5f));
                int oG=clamp(oC.getGreen()+(int)(eG[x]+pEG+0.5f));
                int oB=clamp(oC.getBlue()+(int)(eB[x]+pEB+0.5f));
                Color clC=findClosestColor(new Color(oR,oG,oB),targetPalette);
                image.setRGB(x,y,clC.getRGB());
                
                float errR=(oR-clC.getRed())*dF;
                float errG=(oG-clC.getGreen())*dF;
                float errB=(oB-clC.getBlue())*dF;
                
                pER=errR*7f/16f;
                pEG=errG*7f/16f;
                pEB=errB*7f/16f;
                
                if(x>0){
                    nER[x-1]+=errR*3f/16f;
                    nEG[x-1]+=errG*3f/16f;
                    nEB[x-1]+=errB*3f/16f;
                }
                
                nER[x]+=errR*5f/16f;
                nEG[x]+=errG*5f/16f;
                nEB[x]+=errB*5f/16f;
                
                if(x<w-1){
                    nER[x+1]+=errR*1f/16f;
                    nEG[x+1]+=errG*1f/16f;
                    nEB[x+1]+=errB*1f/16f;
                }
            }
            
            System.arraycopy(nER,0,eR,0,w);
            System.arraycopy(nEG,0,eG,0,w);
            System.arraycopy(nEB,0,eB,0,w);
        }
        return image;
    }
    
    BufferedImage atkinsonDitherProcess(BufferedImage image, Color[] targetPalette, double ditherLevelParam) { 
        int w=image.getWidth(),h=image.getHeight();
        float dF=(float)ditherLevelParam/8.0f;
        float[] eR=new float[w+2],eG=new float[w+2],eB=new float[w+2],nER=new float[w+2],nEG=new float[w+2],nEB=new float[w+2],nnER=new float[w+2],nnEG=new float[w+2],nnEB=new float[w+2];
        
        for(int y=0;y<h;y++){
            System.arraycopy(nER,0,eR,0,w+2);
            System.arraycopy(nEG,0,eG,0,w+2);
            System.arraycopy(nEB,0,eB,0,w+2);
            System.arraycopy(nnER,0,nER,0,w+2);
            System.arraycopy(nnEG,0,nEG,0,w+2);
            System.arraycopy(nnEB,0,nEB,0,w+2);
            
            Arrays.fill(nnER,0f);
            Arrays.fill(nnEG,0f);
            Arrays.fill(nnEB,0f);
            
            int idx;
            for(int x=0;x<w;x++){
                idx=x+1;
                Color oC=new Color(image.getRGB(x,y));
                int oR=clamp(oC.getRed()+(int)(eR[idx]+0.5f));
                int oG=clamp(oC.getGreen()+(int)(eG[idx]+0.5f));
                int oB=clamp(oC.getBlue()+(int)(eB[idx]+0.5f));
                Color clC=findClosestColor(new Color(oR,oG,oB),targetPalette);
                image.setRGB(x,y,clC.getRGB());
                
                float errR=(oR-clC.getRed())*dF;
                float errG=(oG-clC.getGreen())*dF;
                float errB=(oB-clC.getBlue())*dF;
                
                if(idx+1<eR.length){
                    eR[idx+1]+=errR;
                    eG[idx+1]+=errG;
                    eB[idx+1]+=errB;
                }
                
                if(idx+2<eR.length){
                    eR[idx+2]+=errR;
                    eG[idx+2]+=errG;
                    eB[idx+2]+=errB;
                }
                
                if(idx-1>=0){
                    nER[idx-1]+=errR;
                    nEG[idx-1]+=errG;
                    nEB[idx-1]+=errB;
                }
                
                nER[idx]+=errR;
                nEG[idx]+=errG;
                nEB[idx]+=errB;
                
                if(idx+1<nER.length){
                    nER[idx+1]+=errR;
                    nEG[idx+1]+=errG;
                    nEB[idx+1]+=errB;
                }
                
                nnER[idx]+=errR;
                nnEG[idx]+=errG;
                nnEB[idx]+=errB;
            }
        }
        return image;
    }
    
    BufferedImage jjnDitherProcess(BufferedImage image, Color[] targetPalette, double ditherLevelParam) { 
        int w=image.getWidth(),h=image.getHeight();
        float dF=(float)ditherLevelParam/48.0f;
        float[] eR=new float[w+4],eG=new float[w+4],eB=new float[w+4],nER=new float[w+4],nEG=new float[w+4],nEB=new float[w+4],nnER=new float[w+4],nnEG=new float[w+4],nnEB=new float[w+4];
        
        for(int y=0;y<h;y++){
            System.arraycopy(nER,0,eR,0,w+4);
            System.arraycopy(nEG,0,eG,0,w+4);
            System.arraycopy(nEB,0,eB,0,w+4);
            System.arraycopy(nnER,0,nER,0,w+4);
            System.arraycopy(nnEG,0,nEG,0,w+4);
            System.arraycopy(nnEB,0,nEB,0,w+4);
            
            Arrays.fill(nnER,0f);
            Arrays.fill(nnEG,0f);
            Arrays.fill(nnEB,0f);
            
            int idx;
            for(int x=0;x<w;x++){
                idx=x+2;
                Color oC=new Color(image.getRGB(x,y));
                int oR=clamp(oC.getRed()+(int)(eR[idx]+0.5f));
                int oG=clamp(oC.getGreen()+(int)(eG[idx]+0.5f));
                int oB=clamp(oC.getBlue()+(int)(eB[idx]+0.5f));
                Color clC=findClosestColor(new Color(oR,oG,oB),targetPalette);
                image.setRGB(x,y,clC.getRGB());
                
                float errR=(oR-clC.getRed())*dF;
                float errG=(oG-clC.getGreen())*dF;
                float errB=(oB-clC.getBlue())*dF;
                
                if(idx+1<eR.length){
                    eR[idx+1]+=errR*7f;
                    eG[idx+1]+=errG*7f;
                    eB[idx+1]+=errB*7f;
                }
                
                if(idx+2<eR.length){
                    eR[idx+2]+=errR*5f;
                    eG[idx+2]+=errG*5f;
                    eB[idx+2]+=errB*5f;
                }
                
                if(idx-2>=0){
                    nER[idx-2]+=errR*3f;
                    nEG[idx-2]+=errG*3f;
                    nEB[idx-2]+=errB*3f;
                }
                
                if(idx-1>=0){
                    nER[idx-1]+=errR*5f;
                    nEG[idx-1]+=errG*5f;
                    nEB[idx-1]+=errB*5f;
                }
                
                nER[idx]+=errR*7f;
                nEG[idx]+=errG*7f;
                nEB[idx]+=errB*7f;
                
                if(idx+1<nER.length){
                    nER[idx+1]+=errR*5f;
                    nEG[idx+1]+=errG*5f;
                    nEB[idx+1]+=errB*5f;
                }
                
                if(idx+2<nER.length){
                    nER[idx+2]+=errR*3f;
                    nEG[idx+2]+=errG*3f;
                    nEB[idx+2]+=errB*3f;
                }
                
                if(idx-2>=0){
                    nnER[idx-2]+=errR*1f;
                    nnEG[idx-2]+=errG*1f;
                    nnEB[idx-2]+=errB*1f;
                }
                
                if(idx-1>=0){
                    nnER[idx-1]+=errR*3f;
                    nnEG[idx-1]+=errG*3f;
                    nnEB[idx-1]+=errB*3f;
                }
                
                nnER[idx]+=errR*5f;
                nnEG[idx]+=errG*5f;
                nnEB[idx]+=errB*5f;
                
                if(idx+1<nnER.length){
                    nnER[idx+1]+=errR*3f;
                    nnEG[idx+1]+=errG*3f;
                    nnEB[idx+1]+=errB*3f;
                }
                
                if(idx+2<nnER.length){
                    nnER[idx+2]+=errR*1f;
                    nnEG[idx+2]+=errG*1f;
                    nnEB[idx+2]+=errB*1f;
                }
            }
        }
        return image;
    }
    
    BufferedImage bayerDitherProcess(BufferedImage image, int requestedN, Color[] targetPalette, double ditherLevelParam) { 
        int width=image.getWidth(),height=image.getHeight();
        BufferedImage outputImage=new BufferedImage(width,height,BufferedImage.TYPE_INT_RGB);
        int[][] bayerMatrix=getBayerMatrix(requestedN);
        int actualN=bayerMatrix.length;
        float ditherFactor=(float)ditherLevelParam;
        float thresholdDivisor=(float)(actualN*actualN);
        
        for(int y=0;y<height;y++){
            for(int x=0;x<width;x++){
                Color originalColor=new Color(image.getRGB(x,y));
                float threshold=(bayerMatrix[y%actualN][x%actualN]/thresholdDivisor)*255f*ditherFactor;
                int r=clamp(originalColor.getRed()+(int)(threshold-(127.5f*ditherFactor)+0.5f));
                int g=clamp(originalColor.getGreen()+(int)(threshold-(127.5f*ditherFactor)+0.5f));
                int b=clamp(originalColor.getBlue()+(int)(threshold-(127.5f*ditherFactor)+0.5f));
                outputImage.setRGB(x,y,findClosestColor(new Color(r,g,b),targetPalette).getRGB());
            }
        }
        return outputImage;
    }
    
    BufferedImage halftoneDitherProcess(BufferedImage image, Color[] targetPalette, double ditherLevelParam) { 
        int width=image.getWidth(),height=image.getHeight();
        BufferedImage outputImage=new BufferedImage(width,height,BufferedImage.TYPE_INT_RGB);
        float ditherFactor=(float)ditherLevelParam;
        
        for(int y=0;y<height;y++){
            for(int x=0;x<width;x++){
                Color originalColor=new Color(image.getRGB(x,y));
                float thresholdOffset=((x+y)%2==0)?(128f*ditherFactor):(-128f*ditherFactor);
                int r=clamp(originalColor.getRed()+(int)(thresholdOffset+0.5f));
                int g=clamp(originalColor.getGreen()+(int)(thresholdOffset+0.5f));
                int b=clamp(originalColor.getBlue()+(int)(thresholdOffset+0.5f));
                outputImage.setRGB(x,y,findClosestColor(new Color(r,g,b),targetPalette).getRGB());
            }
        }
        return outputImage;
    }
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
                    if (cMode == ColorMode.USER_DEFINED) { 
                        paletteForPreDithering = zxPaletteNormal; 
                        if (pA.indexes.isEmpty() && iA.indexes.isEmpty()) 
                            paletteForPreDithering = bwPalette; 
                    }
                    else if (cMode == ColorMode.CUSTOM) { 
                        paletteForPreDithering = custPal != null && custPal.length > 0 ? custPal : bwPalette; 
                    }
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
                if (cMode == ColorMode.USER_DEFINED) { 
                    paletteForDithering = zxPaletteNormal; 
                    if (pA.indexes.isEmpty() && iA.indexes.isEmpty()) 
                        paletteForDithering = bwPalette; 
                }
                else if (cMode == ColorMode.CUSTOM) { 
                    paletteForDithering = custPal != null && custPal.length > 0 ? custPal : bwPalette; 
                }
                BufferedImage ditheredImage = applyDithering(adjustedImage, dMode, paletteForDithering, dLevel);
                finalImage = convertToZXSpectrum(adjustedImage, ditheredImage, blockX, blockY, ditheringMode, paletteForDithering, ditheringLevel);
            }
        } catch (Exception e) {
            // 1) log the stack to the ImageJ log window
            IJ.log("!!! EXCEPTION during processImage !!! " + e);
            for (StackTraceElement ste : e.getStackTrace()) {
                IJ.log("    at " + ste);
            }
            // 2) rethrow so your PreviewWorker can catch it
            throw e;
        }

        if (finalImage != null && ip != null) {
            if (finalImage.getType() == BufferedImage.TYPE_INT_RGB && ip instanceof ColorProcessor) {
                int[] pixels = ((DataBufferInt) finalImage.getRaster().getDataBuffer()).getData();
                if (pixels.length == ip.getPixelCount()) { 
                    ip.setPixels(pixels); 
                }
                else { 
                    IJ.log("Error: Final image size mismatch. Cannot update processor via setPixels."); 
                    ImagePlus tempImp = new ImagePlus("", finalImage); 
                    ip.insert(tempImp.getProcessor(), 0, 0); 
                }
            } else {
                 IJ.log("Warning: Processor type or image type mismatch. Using fallback insert."); 
                 ImagePlus tempImp = new ImagePlus("", finalImage); 
                 ImageProcessor tempIp = tempImp.getProcessor();
                 if (tempIp != null && tempIp.getWidth() <= ip.getWidth() && tempIp.getHeight() <= ip.getHeight()) { 
                     ip.insert(tempIp, 0, 0); 
                 }
                 else { 
                     IJ.log("Error: Final image invalid or larger than processor."); 
                 }
            }
        } else { 
            IJ.log("Error: Final image was null or processor was null."); 
        }
    }

    // --- Interlace Processing Method Implementation ---
    /**
     * Interlace-mode processing with Lab-based top-K pruning.
     */
    BufferedImage processInterlaceModeNew(
            BufferedImage adjustedImage,
            BufferedImage ditheredInputImage,
            boolean isPreDithered,
            int blockX,
            int blockY,
            DitheringMode dMode,
            ColorMode cMode,
            Color[] activePal,
            Color[] custPal,
            UserColorSelection pA,
            UserColorSelection iA,
            UserColorSelection pB,
            UserColorSelection iB,
            double dLevel,
            double brightThresh)
    {
        IJ.log("--- Starting Interlace Processing (isPreDithered=" + isPreDithered + ") ---");

        // 1) Rebuild per-pixel Lab buffers for this frame
        ensureLabBuffers(adjustedImage);

        // 2) Use the active palette for this frame
        Color[] finalBlockPalette = activePal;

        // 3) Cache palette→Lab once
        computePaletteLab(finalBlockPalette);

        int width  = adjustedImage.getWidth();
        int height = adjustedImage.getHeight();
        BufferedImage avgImage = new BufferedImage(width, height, BufferedImage.TYPE_INT_RGB);
        WritableRaster avgRaster = avgImage.getRaster();

        for (int by = 0; by < height; by += blockY) {
            IJ.showProgress((double)by / height);
            for (int bx = 0; bx < width; bx += blockX) {
                int currentBlockW = Math.min(blockX, width  - bx);
                int currentBlockH = Math.min(blockY, height - by);
                if (currentBlockW <= 0 || currentBlockH <= 0) continue;

                // prepare the two input blocks
                BufferedImage origBlock = adjustedImage.getSubimage(bx, by, currentBlockW, currentBlockH);
                BufferedImage ditherBlock = ditheredInputImage.getSubimage(bx, by, currentBlockW, currentBlockH);

                // --- PRUNE: find the K palette entries closest to this block in Lab ---
                float[] centroid = blockCentroidLab(bx, by, currentBlockW, currentBlockH);
                int[]   topK     = topKCandidates(centroid);

                // build small candidate lists
                List<Color> papA = new ArrayList<>(),
                             inkA = new ArrayList<>(),
                             papB = new ArrayList<>(),
                             inkB = new ArrayList<>();
                for (int idx : topK) {
                    Color c = finalBlockPalette[idx];
                    papA.add(c);
                    inkA.add(c);
                    papB.add(c);
                    inkB.add(c);
                }

                // --- SEARCH over only K×K×K×K combinations now ---
                double   bestErr = Double.MAX_VALUE;
                Color    bestPA  = papA.get(0),
                         bestIA  = inkA.get(0),
                         bestPB  = papB.get(0),
                         bestIB  = inkB.get(0);

                for (Color cPA : papA) {
                    for (Color cIA : inkA) {
                        if (cIA.equals(cPA)) continue;
                        for (Color cPB : papB) {
                            for (Color cIB : inkB) {
                                if (cIB.equals(cPB)) continue;

                                boolean[][] dA = ditherBlockBoolean(ditherBlock, dMode, cPA, cIA, dLevel, isPreDithered);
                                boolean[][] dB = ditherBlockBoolean(ditherBlock, dMode, cPB, cIB, dLevel, isPreDithered);
                                double err = blockErrorBoolean(ditherBlock, dA, dB, cPA, cIA, cPB, cIB);

                                if (err < bestErr) {
                                    bestErr = err;
                                    bestPA  = cPA;
                                    bestIA  = cIA;
                                    bestPB  = cPB;
                                    bestIB  = cIB;
                                }
                            }
                        }
                    }
                }

                // --- RENDER the block with the best pair ---
                boolean[][] finalA = ditherBlockBoolean(ditherBlock, dMode, bestPA, bestIA, dLevel, isPreDithered);
                boolean[][] finalB = ditherBlockBoolean(ditherBlock, dMode, bestPB, bestIB, dLevel, isPreDithered);
                int[] pixelRow = new int[currentBlockW * 3];

                for (int dy = 0; dy < currentBlockH; dy++) {
                    int k = 0;
                    for (int dx = 0; dx < currentBlockW; dx++) {
                        boolean aOn = finalA[dy][dx], bOn = finalB[dy][dx];
                        Color outC;
                        if (!aOn && !bOn)         outC = averageColors(bestPA, bestPB);
                        else if (aOn && !bOn)     outC = averageColors(bestIA, bestPB);
                        else if (!aOn && bOn)     outC = averageColors(bestPA, bestIB);
                        else /* both on */        outC = averageColors(bestIA, bestIB);

                        pixelRow[k++] = outC.getRed();
                        pixelRow[k++] = outC.getGreen();
                        pixelRow[k++] = outC.getBlue();
                    }
                    avgRaster.setPixels(bx, by + dy, currentBlockW, 1, pixelRow);
                }
            }
        }

        IJ.showProgress(1.0);
        IJ.log("--- Finished Interlace Processing ---");
        return avgImage;
    }

    /** Helper to check average brightness of a block */
    private boolean checkBlockBrightness(BufferedImage blockRegion, double brightThresh) { 
        /* ... Same as before ... */ 
        long totalIntensity = 0; 
        int pixelCount = 0; 
        int width = blockRegion.getWidth(); 
        int height = blockRegion.getHeight(); 
        
        if (blockRegion.getType() == BufferedImage.TYPE_INT_RGB) { 
            int[] pixels = ((DataBufferInt) blockRegion.getRaster().getDataBuffer()).getData(); 
            for (int rgb : pixels) { 
                int r = (rgb >> 16) & 0xff; 
                int g = (rgb >> 8) & 0xff; 
                int b = rgb & 0xff; 
                totalIntensity += (r + g + b); 
                pixelCount++; 
            } 
            if (pixelCount > 0) { 
                return (totalIntensity / (pixelCount * 3.0)) >= brightThresh; 
            } 
        } else { 
            for (int y = 0; y < height; y++) { 
                for (int x = 0; x < width; x++) { 
                    Color c = new Color(blockRegion.getRGB(x, y)); 
                    totalIntensity += (c.getRed() + c.getGreen() + c.getBlue()); 
                    pixelCount++; 
                } 
            } 
            if (pixelCount > 0) { 
                return (totalIntensity / (pixelCount * 3.0)) >= brightThresh; 
            } 
        } 
        return false; 
    }

    // --- Non-Interlaced Block Processing Wrapper (optimal two-color search + dither) ---
    BufferedImage convertToZXSpectrum(
            BufferedImage adjustedImage,
            BufferedImage ditheredImage,
            int blockW,
            int blockH,
            DitheringMode dMode,
            Color[] palette,
            double ditherLevel
    ) {
        int width  = ditheredImage.getWidth();
        int height = ditheredImage.getHeight();
        BufferedImage zxImage = new BufferedImage(width, height, BufferedImage.TYPE_INT_RGB);

        // If block = 1×1, just copy the dithered result
        if (blockW <= 1 && blockH <= 1) {
            Graphics2D g = zxImage.createGraphics();
            g.drawImage(ditheredImage, 0, 0, null);
            g.dispose();
            return zxImage;
        }

        for (int y = 0; y < height; y += blockH) {
            for (int x = 0; x < width;  x += blockW) {
                int w = Math.min(blockW, width  - x);
                int h = Math.min(blockH, height - y);
                // new helper does the full two-color search + applyDithering()
                processBlockOptimalDither(
                    adjustedImage,
                    ditheredImage,
                    zxImage,
                    x, y, w, h,
                    dMode, palette,
                    ditherLevel
                );
            }
        }
        return zxImage;
    }

    /** Processes a single block for non-interlaced output (Handles USER_DEFINED Option 1, FIXED Fallback logic) */
    void processBlock(BufferedImage adjustedImage, BufferedImage ditheredImage, BufferedImage outputImage,
                      int startX, int startY, int blockWidth, int blockHeight, ColorMode cMode,
                      UserColorSelection paperA, UserColorSelection inkA, // Receive parsed selections
                      double brightThresh, Color[] ditherPalette)
    {
        /* ... Same as before ... */
        boolean logThisBlock=(startX==0&&startY==0);
        if(logThisBlock)IJ.log(String.format("processBlock START (%d,%d) Mode=%s, PaperSel=%s, InkSel=%s",startX,startY,cMode,paperA,inkA));
        int endX=Math.min(startX+blockWidth,ditheredImage.getWidth());
        int endY=Math.min(startY+blockHeight,ditheredImage.getHeight());
        if(startX>=endX||startY>=endY)return;
        
        BrightMode blockBrightMode=BrightMode.OFF;
        Color[] blockPaletteNormal=zxPaletteNormal;
        Color[] blockPaletteBright=zxPaletteBright;
        
        if(cMode==ColorMode.USER_DEFINED){
            blockBrightMode=determineBlockBrightMode(paperA,inkA);
            if(blockBrightMode==BrightMode.ALLOWED){
                double totalIntensity=0;
                int pixelCount=0;
                for(int y=startY;y<endY;y++){
                    for(int x=startX;x<endX;x++){
                        Color adjColor=new Color(adjustedImage.getRGB(x,y));
                        totalIntensity+=(adjColor.getRed()+adjColor.getGreen()+adjColor.getBlue())/3.0;
                        pixelCount++;
                    }
                }
                if(pixelCount>0&&(totalIntensity/pixelCount)>=brightThresh){
                    blockBrightMode=BrightMode.FORCED;
                }else{
                    blockBrightMode=BrightMode.OFF;
                }
            }
        }else if(cMode==ColorMode.ZX_BRIGHT_ATTRIBUTE){
            double totalIntensity=0;
            int pixelCount=0;
            for(int y=startY;y<endY;y++){
                for(int x=startX;x<endX;x++){
                    Color adjColor=new Color(adjustedImage.getRGB(x,y));
                    totalIntensity+=(adjColor.getRed()+adjColor.getGreen()+adjColor.getBlue())/3.0;
                    pixelCount++;
                }
            }
            if(pixelCount>0&&(totalIntensity/pixelCount)>=brightThresh){
                blockBrightMode=BrightMode.FORCED;
            }else{
                blockBrightMode=BrightMode.OFF;
            }
        }
        
        Color[] finalBlockPalette=(blockBrightMode==BrightMode.FORCED)?blockPaletteBright:blockPaletteNormal;
        Color finalInk=Color.BLACK;
        Color finalPaper=Color.WHITE;
        
        if(cMode==ColorMode.USER_DEFINED){
            if(logThisBlock)IJ.log(String.format("processBlock (%d,%d) EXECUTING USER_DEFINED BRANCH",startX,startY));
            List<Color> allowedPaperColors=getPaletteColors(blockBrightMode,paperA.indexes);
            List<Color> allowedInkColors=getPaletteColors(blockBrightMode,inkA.indexes);
            
            if(logThisBlock)IJ.log(String.format("processBlock (%d,%d) AllowedPaper=%s, AllowedInk=%s",startX,startY,allowedPaperColors,allowedInkColors));
            
            if(allowedInkColors.isEmpty()){
                allowedInkColors.add(finalBlockPalette[0]);
            }
            
            if(allowedPaperColors.isEmpty()){
                Color tempP=findClosestDifferentPaletteColor(allowedInkColors.get(0),finalBlockPalette);
                allowedPaperColors.add(tempP!=null?tempP:(finalBlockPalette.length>1?finalBlockPalette[1]:finalBlockPalette[0]));
            }
            
            Set<Color> allowedBlockSet=new LinkedHashSet<>(allowedInkColors);
            allowedBlockSet.addAll(allowedPaperColors);
            List<Color> allowedBlockColors=new ArrayList<>(allowedBlockSet);
            
            Map<Color,Integer> colorCounts=new HashMap<>();
            if(!allowedBlockColors.isEmpty()){
                for(int y=startY;y<endY;y++){
                    for(int x=startX;x<endX;x++){
                        Color ditheredPixelColor=new Color(ditheredImage.getRGB(x,y));
                        Color closestAllowed=findClosestColor(ditheredPixelColor,allowedBlockColors);
                        colorCounts.put(closestAllowed,colorCounts.getOrDefault(closestAllowed,0)+1);
                    }
                }
            }
            
            List<Map.Entry<Color,Integer>> sortedCounts=new ArrayList<>(colorCounts.entrySet());
            sortedCounts.sort((e1,e2)->e2.getValue().compareTo(e1.getValue()));
            
            finalInk=null;
            for(Map.Entry<Color,Integer> entry:sortedCounts){
                if(allowedInkColors.contains(entry.getKey())){
                    finalInk=entry.getKey();
                    break;
                }
            }
            
            if(finalInk==null){
                finalInk=!allowedInkColors.isEmpty()?allowedInkColors.get(0):finalBlockPalette[0];
                if(logThisBlock)IJ.log("Block ("+startX+","+startY+") UserDefined Ink: Fallback used -> "+colorToName(finalInk));
            }
            
            finalPaper=null;
            for(Map.Entry<Color,Integer> entry:sortedCounts){
                Color potentialPaper=entry.getKey();
                if(!potentialPaper.equals(finalInk)&&allowedPaperColors.contains(potentialPaper)){
                    finalPaper=potentialPaper;
                    break;
                }
            }
            
            if(finalPaper==null){
                if(logThisBlock)IJ.log(String.format("processBlock (%d,%d) Paper Fallback 1 triggered (most frequent failed).",startX,startY));
                Color fallback1Paper=findClosestDifferentPaletteColor(finalInk,allowedPaperColors);
                if(logThisBlock)IJ.log(String.format("processBlock (%d,%d) Paper Fallback 1: Ink=%s, AllowedPapers=%s -> Result=%s",startX,startY,colorToName(finalInk),allowedPaperColors,colorToName(fallback1Paper)));
                
                if(fallback1Paper==null){
                    if(logThisBlock)IJ.log(String.format("processBlock (%d,%d) Paper Fallback 1 failed (no different allowed paper)! Triggering Fallback 1.5.",startX,startY));
                    Color fallback1_5Paper=findClosestDifferentPaletteColor(finalInk,allowedInkColors);
                    if(logThisBlock)IJ.log(String.format("processBlock (%d,%d) Paper Fallback 1.5: Ink=%s, AllowedInks=%s -> Result=%s",startX,startY,colorToName(finalInk),allowedInkColors,colorToName(fallback1_5Paper)));
                    
                    if(fallback1_5Paper!=null){
                        finalPaper=fallback1_5Paper;
                        if(logThisBlock)IJ.log(String.format("processBlock (%d,%d) Paper Fallback 1.5 successful.",startX,startY));
                    }else{
                        if(logThisBlock)IJ.log(String.format("processBlock (%d,%d) Paper Fallback 1.5 failed! Triggering Fallback 2.",startX,startY));
                        finalPaper=findClosestDifferentPaletteColor(finalInk,finalBlockPalette);
                        if(logThisBlock)IJ.log(String.format("processBlock (%d,%d) Paper Fallback 2: Ink=%s, BlockPalette -> Result=%s",startX,startY,colorToName(finalInk),colorToName(finalPaper)));
                        
                        if(finalPaper==null||finalPaper.equals(finalInk)){
                            finalPaper=finalBlockPalette.length>0?finalBlockPalette[0]:Color.WHITE;
                            if(finalPaper.equals(finalInk)&&finalBlockPalette.length>1){
                                finalPaper=finalBlockPalette[1];
                            }else if(finalPaper.equals(finalInk)&&finalBlockPalette.length==1){
                                finalPaper=finalBlockPalette[0];
                            }
                            if(logThisBlock)IJ.log(String.format("processBlock (%d,%d) Paper Fallback 2 failed/returned ink! Using ultimate fallback: %s",startX,startY,colorToName(finalPaper)));
                        }
                    }
                }else{
                    finalPaper=fallback1Paper;
                    if(logThisBlock)IJ.log(String.format("processBlock (%d,%d) Paper Fallback 1 successful.",startX,startY));
                }
            }
            
            if(logThisBlock)IJ.log(String.format("processBlock (%d,%d) UserDefined Final -> Ink: %s Paper: %s",startX,startY,colorToName(finalInk),colorToName(finalPaper)));
        }else{
            if(logThisBlock)IJ.log(String.format("processBlock (%d,%d) EXECUTING DOMINANT COLOR (ELSE) BRANCH for mode %s",startX,startY,cMode));
            Map<Color,Integer> colorCounts=new HashMap<>();
            
            for(int y=startY;y<endY;y++){
                for(int x=startX;x<endX;x++){
                    Color ditheredPixelColor=new Color(ditheredImage.getRGB(x,y));
                    Color closestInBlockPalette=findClosestColor(ditheredPixelColor,finalBlockPalette);
                    colorCounts.put(closestInBlockPalette,colorCounts.getOrDefault(closestInBlockPalette,0)+1);
                }
            }
            
            if(!colorCounts.isEmpty()){
                java.util.List<Map.Entry<Color,Integer>> entryList=new java.util.ArrayList<>(colorCounts.entrySet());
                entryList.sort((e1,e2)->e2.getValue().compareTo(e1.getValue()));
                
                finalInk=entryList.get(0).getKey();
                if(entryList.size()>1){
                    finalPaper=entryList.get(1).getKey();
                    if(finalPaper.equals(finalInk)){
                        finalPaper=findClosestDifferentPaletteColor(finalInk,finalBlockPalette);
                    }
                }else{
                    finalPaper=findClosestDifferentPaletteColor(finalInk,finalBlockPalette);
                }
                
                if(finalPaper==null){
                    finalPaper=finalBlockPalette.length>1?finalBlockPalette[1]:finalBlockPalette[0];
                    if(finalPaper.equals(finalInk)&&finalBlockPalette.length>0)
                        finalPaper=finalBlockPalette[0];
                }
            }else{
                finalInk=finalBlockPalette.length>0?finalBlockPalette[0]:Color.BLACK;
                finalPaper=findClosestDifferentPaletteColor(finalInk,finalBlockPalette);
                if(finalPaper==null){
                    finalPaper=finalBlockPalette.length>1?finalBlockPalette[1]:finalBlockPalette[0];
                    if(finalPaper.equals(finalInk)&&finalBlockPalette.length>0)
                        finalPaper=finalBlockPalette[0];
                }
            }
            
            if(logThisBlock)IJ.log(String.format("processBlock (%d,%d) Dominant Final -> Ink: %s Paper: %s",startX,startY,colorToName(finalInk),colorToName(finalPaper)));
        }
        
        for(int y=startY;y<endY;y++){
            for(int x=startX;x<endX;x++){
                Color ditheredPixelColor=new Color(ditheredImage.getRGB(x,y));
                double distInk=colorDistanceSq(ditheredPixelColor,finalInk);
                double distPaper=colorDistanceSq(ditheredPixelColor,finalPaper);
                outputImage.setRGB(x,y,(distInk<=distPaper)?finalInk.getRGB():finalPaper.getRGB());
            }
        }
        
        if(logThisBlock)IJ.log(String.format("processBlock END (%d,%d)",startX,startY));
    }

    void processBlockOptimalDither(
            BufferedImage adjustedImage,
            BufferedImage ditherSourceImage,
            BufferedImage outputImage,
            int startX, int startY,
            int blockW,  int blockH,
            DitheringMode dMode,
            Color[] palette,
            double ditherLevel
    ) {
        // --- 1) grab the block as a subimage (no scaling, exactly blockW×blockH pixels) ---
        BufferedImage blockCopy = ditherSourceImage
            .getSubimage(startX, startY, blockW, blockH);

        // --- 2) search all two-color (paper/ink) pairs for minimum error ---
        double        bestErr    = Double.MAX_VALUE;
        BufferedImage bestDither = null;

        for (int i = 0; i < palette.length; i++) {
            for (int j = 0; j < palette.length; j++) {
                if (i == j) continue;
                Color paper = palette[i], ink = palette[j];

                // 3) dither this blockCopy into [paper, ink]
                BufferedImage candidate = applyDithering(
                    blockCopy,
                    dMode,
                    new Color[]{ paper, ink },
                    ditherLevel
                );

                // 4) measure squared-error against adjustedImage
                double err = 0;
                for (int y = 0; y < blockH; y++) {
                    for (int x = 0; x < blockW; x++) {
                        int rgb0 = adjustedImage.getRGB(startX + x, startY + y);
                        int rgb1 = candidate     .getRGB(            x,             y);
                        err += colorDistanceSq(
                            new Color(rgb0),
                            new Color(rgb1)
                        );
                    }
                }

                if (err < bestErr) {
                    bestErr    = err;
                    bestDither = candidate;
                }
            }
        }

        // --- 5) blit the bestDither back to the exact same pixel region ---
        Graphics2D g = outputImage.createGraphics();
        g.drawImage(bestDither, startX, startY, null);
        g.dispose();
    }

    /**
     * Process a single block by searching over all paper/ink pairs,
     * dithering *just that block* for each pair at the given ditherLevel,
     * and picking the pair that minimizes MSE against the source block.
     */
    void processBlockOptimalDither(
            BufferedImage adjustedImage,      // B/C/G adjusted full image
            BufferedImage outputImage,        // the ZX output canvas
            int startX, int startY,
            int blockW, int blockH,
            DitheringMode dMode,
            Color[] palette,                  // ZX or custom palette
            double ditherLevel
    ) {
        // 1) extract the source block
        BufferedImage srcBlk = adjustedImage.getSubimage(startX, startY, blockW, blockH);

        double    bestErr   = Double.MAX_VALUE;
        BufferedImage bestD = null;

        // 2) search over all two-color pairs
        for (int i = 0; i < palette.length; i++) {
            Color paper = palette[i];
            for (int j = 0; j < palette.length; j++) {
                Color ink = palette[j];
                if (ink.equals(paper)) continue;

                // build a 2-color palette
                Color[] twoPal = new Color[]{ paper, ink };

                // 3) dither just this block to the two colors
                BufferedImage blockCopy = new BufferedImage(blockW, blockH, BufferedImage.TYPE_INT_RGB);
                Graphics2D g = blockCopy.createGraphics();
                g.drawImage(srcBlk, 0, 0, null);
                g.dispose();

                BufferedImage dBlk = applyDithering(blockCopy, dMode, twoPal, ditherLevel);

                // 4) compute MSE against the source block
                double err = blockMSE(srcBlk, dBlk);
                if (err < bestErr) {
                    bestErr = err;
                    bestD   = dBlk;
                }
            }
        }

        // 5) paint the best-found dither into the output
        if (bestD != null) {
            outputImage.getRaster()
                       .setRect(startX, startY, bestD.getRaster());
        }
    }

    /** Mean-squared error between two equally-sized RGB blocks */
    private double blockMSE(BufferedImage a, BufferedImage b) {
        int w = a.getWidth(), h = a.getHeight();
        double sum = 0;
        for (int y = 0; y < h; y++) {
            for (int x = 0; x < w; x++) {
                int rgbA = a.getRGB(x,y), rgbB = b.getRGB(x,y);
                int dr = ((rgbA>>16)&0xff) - ((rgbB>>16)&0xff);
                int dg = ((rgbA>>8 )&0xff) - ((rgbB>>8 )&0xff);
                int db = ((rgbA    )&0xff) - ((rgbB    )&0xff);
                sum += dr*dr + dg*dg + db*db;
            }
        }
        return sum / (w * h);
    }

    // --- Color Utility Methods ---
    List<Color> getPaletteColors(BrightMode b, List<Integer> i){ 
        List<Color> r=new ArrayList<>();
        Color[] s;
        if(b==BrightMode.FORCED){
            s=zxPaletteBright;
        }else{
            s=zxPaletteNormal;
        }
        
        if(i==null||i.isEmpty()){
            r.addAll(Arrays.asList(s));
        }else{
            for(int x:i){
                if(x>=0&&x<s.length){
                    if(!r.contains(s[x])){
                        r.add(s[x]);
                    }
                }
            }
        }
        
        if(r.isEmpty()){
            IJ.log("Warning: getPaletteColors resulted in empty list for block. Adding default Black.");
            r.add(s[0]);
        }
        return r;
    }
    
    Color getBrightColor(Color n){ 
        if(n==null) return Color.BLACK; 
        for(int i=0;i<zxPaletteNormal.length;i++)
            if(zxPaletteNormal[i].equals(n))
                return zxPaletteBright[i]; 
        return n;
    }
    
    Color findClosestDifferentPaletteColor(Color inputColor, Color[] targetPalette) { 
        Color closest=null;
        double minDistanceSq=Double.MAX_VALUE;
        boolean foundDifferent=false;
        
        if(targetPalette!=null&&targetPalette.length>0){
            for(Color paletteColor:targetPalette){
                if(paletteColor==null||paletteColor.equals(inputColor)) continue;
                foundDifferent=true;
                double distanceSq=colorDistanceSq(inputColor,paletteColor);
                if(distanceSq<minDistanceSq){
                    minDistanceSq=distanceSq;
                    closest=paletteColor;
                }
            }
        }
        
        if(foundDifferent){
            return closest;
        }else{
            return null;
        }
    }
    
    Color findClosestDifferentPaletteColor(Color i, List<Color> t){ 
        if(t==null||t.isEmpty()){
            return null;
        } 
        return findClosestDifferentPaletteColor(i,t.toArray(new Color[0])); 
    }
    
    double colorDistanceSq(Color c1, Color c2){ 
        long dr=c1.getRed()-c2.getRed();
        long dg=c1.getGreen()-c2.getGreen();
        long db=c1.getBlue()-c2.getBlue(); 
        return dr*dr+dg*dg+db*db; 
    }
    
    double colorDistance(Color c1, Color c2){ 
        return Math.sqrt(colorDistanceSq(c1, c2)); 
    }
    
    Color findClosestColor(Color i, Color[] t){ 
        if(t==null||t.length==0) return Color.BLACK; 
        Color c=t[0];
        double m=colorDistanceSq(i,c);
        
        for(int j=1;j<t.length;j++){
            if(m==0) break; 
            Color p=t[j];
            double d=colorDistanceSq(i,p);
            if(d<m){
                m=d;
                c=p;
            }
        }
        return c; 
    }
    
    Color findClosestColor(Color i, List<Color> t){ 
        if(t==null||t.isEmpty()) return Color.BLACK; 
        Color[] p=t.toArray(new Color[0]); 
        if(p.length<1) return Color.BLACK; 
        return findClosestColor(i,p); 
    }

    // --- Palette Loading ---
    boolean loadPaletteFromFile(String filePath) { 
        java.util.List<Color> loadedPalette = new java.util.ArrayList<>(); 
        try (BufferedReader br = new BufferedReader(new FileReader(filePath))) { 
            String line; 
            int lineNum = 0; 
            
            while ((line = br.readLine()) != null) { 
                lineNum++; 
                line = line.trim(); 
                if (line.isEmpty() || line.startsWith("#") || line.startsWith(";") || line.startsWith("//")) continue; 
                
                String[] values = line.split("[,\\s]+"); 
                if (values.length >= 3) { 
                    try { 
                        int r = clamp(Integer.parseInt(values[0].trim())); 
                        int g = clamp(Integer.parseInt(values[1].trim())); 
                        int b = clamp(Integer.parseInt(values[2].trim())); 
                        loadedPalette.add(new Color(r, g, b)); 
                    } catch (NumberFormatException nfe) { 
                        IJ.log("Warning: Invalid number format on line " + lineNum + ": " + line); 
                    } 
                } else { 
                    IJ.log("Warning: Skipping malformed line " + lineNum + " (needs R, G, B): " + line); 
                } 
            } 
            
            if (!loadedPalette.isEmpty()) { 
                this.customPalette = loadedPalette.toArray(new Color[0]); 
                IJ.log("Loaded " + this.customPalette.length + " colors from " + new File(filePath).getName()); 
                return true; 
            } else { 
                IJ.error("Palette Loading", "No valid colors found in file: " + filePath); 
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
        /* ... Same as before ... */ 
        switch (this.colorMode) { 
            case ZX_NORMAL: 
            case ZX_BRIGHT_ATTRIBUTE: 
                return zxPaletteNormal; 
            case C64: 
                return c64Palette; 
            case EGA: 
                return egaPalette; 
            case BLACK_AND_WHITE: 
                return bwPalette; 
            case BLACK_RED_GREEN_WHITE: 
                return brgwPalette; 
            case USER_DEFINED: 
                return zxPaletteNormal; 
            case CUSTOM: 
                return (this.customPalette != null && this.customPalette.length > 0) ? this.customPalette : bwPalette; 
            default: 
                return zxPaletteNormal; 
        } 
    }

    // --- FIXED colorToName ---
    String colorToName(Color c) { 
        if (c == null) return "null"; 
        for(int i=0; i<zxPaletteNormal.length; i++) 
            if(zxPaletteNormal[i].equals(c)) 
                return "ZXN"+i; 
        for(int i=0; i<zxPaletteBright.length; i++) 
            if(zxPaletteBright[i].equals(c)) 
                return "ZXB"+i; 
        return String.format("RGB(%d,%d,%d)", c.getRed(), c.getGreen(), c.getBlue()); 
    }
    // --- END FIXED colorToName ---

    // --- UI Component Visibility Update ---
    private void updateComponentVisibility() { 
        /* ... Same as before ... */ 
        if (colorModeChoice == null || userDefinedPanel == null || interlaceCheckbox == null || paperBLabel == null || paperBField == null || inkBLabel == null || inkBField == null) { 
            return; 
        } 
        
        ColorMode selectedMode = ColorMode.fromString(colorModeChoice.getSelectedItem()); 
        boolean showUserDefined = (selectedMode == ColorMode.USER_DEFINED); 
        boolean needsResize = false; 
        
        if (userDefinedPanel.isVisible() != showUserDefined) { 
            userDefinedPanel.setVisible(showUserDefined); 
            needsResize = true; 
        } 
        
        if (showUserDefined) { 
            boolean showFrameBFields = interlaceCheckbox.getState(); 
            boolean currentVisibility = paperBLabel.isVisible(); 
            if (currentVisibility != showFrameBFields) { 
                paperBLabel.setVisible(showFrameBFields); 
                paperBField.setVisible(showFrameBFields); 
                inkBLabel.setVisible(showFrameBFields); 
                inkBField.setVisible(showFrameBFields); 
                needsResize = true; 
            } 
        } 
        
        if (needsResize) { 
            pack(); 
        } 
    }

    // --- Added Interlace Helper Methods ---
    /** Dithers a block using only two colors and returns boolean map (Ink=true) */
    private boolean[][] ditherBlockBoolean(BufferedImage sourceBlockRegion, DitheringMode dMode, Color paper, Color ink, double dLevel, boolean isPreDithered) { 
        int bw = sourceBlockRegion.getWidth(); 
        int bh = sourceBlockRegion.getHeight(); 
        boolean[][] result = new boolean[bh][bw]; 
        int[][] matrix = getDitherMatrixForMode(dMode); 
        int mh = matrix.length; 
        int mw = matrix[0].length; 
        int levels = mw * mh; 
        float levelF = (float)dLevel; 
        
        for (int dy = 0; dy < bh; dy++) { 
            for (int dx = 0; dx < bw; dx++) { 
                Color orig = new Color(sourceBlockRegion.getRGB(dx, dy)); 
                int thresholdValue = matrix[dy % mh][dx % mw]; 
                boolean useInk; 
                
                if (!isPreDithered && levels > 1 && levelF > 0) { 
                    double distInkSq=colorDistanceSq(orig,ink); 
                    double distPaperSq=colorDistanceSq(orig,paper); 
                    double mixRatio=(distInkSq+distPaperSq>1e-9)?distInkSq/(distInkSq+distPaperSq):0.5; 
                    double bayerThreshold=(double)thresholdValue/(levels); 
                    double effectiveThreshold=0.5+(bayerThreshold-0.5)*levelF; 
                    effectiveThreshold=Math.max(0.0,Math.min(1.0,effectiveThreshold)); 
                    useInk=(mixRatio<effectiveThreshold); 
                } else { 
                    useInk=colorDistanceSq(orig,ink)<=colorDistanceSq(orig,paper); 
                } 
                result[dy][dx]=useInk; 
            } 
        } 
        return result; 
    }
    
    /** Gets the appropriate Bayer matrix */
    private int[][] getDitherMatrixForMode(DitheringMode dMode) { 
        switch(dMode){
            case BAYER_2X2: return BAYER_MATRIX_2X2;
            case BAYER_4X4: return BAYER_MATRIX_4X4;
            case BAYER_8X8: return BAYER_MATRIX_8X8;
            default: return new int[][]{{0}}; 
        } 
    }
    
    /** Helper method to average two colors (DEFINED ONCE HERE) */
    private Color averageColors(Color c1, Color c2) { 
        if (c1 == null || c2 == null) return Color.BLACK; 
        int r = clamp((c1.getRed() + c2.getRed()) / 2); 
        int g = clamp((c1.getGreen() + c2.getGreen()) / 2); 
        int b = clamp((c1.getBlue() + c2.getBlue()) / 2); 
        return new Color(r, g, b); 
    }
    
    /** Calculates the squared error between a reference block and the combined interlaced block */
    private double blockErrorBoolean(BufferedImage referenceBlockRegion, boolean[][] ditherA, boolean[][] ditherB, Color paperA, Color inkA, Color paperB, Color inkB) {
        double totalErrorSq=0;
        int bh=ditherA.length;
        if(bh==0) return 0;
        int bw=ditherA[0].length;
        if(bw==0) return 0;
        
        int[] referencePixels = referenceBlockRegion.getRGB(0, 0, bw, bh, null, 0, bw); 
        int pixelIndex = 0;
        
        for(int dy=0;dy<bh;dy++){ 
            for(int dx=0;dx<bw;dx++){ 
                if(pixelIndex>=referencePixels.length) continue; 
                boolean inkA_state=ditherA[dy][dx]; 
                boolean inkB_state=ditherB[dy][dx]; 
                Color combinedColor;
                
                if(!inkA_state&&!inkB_state){
                    combinedColor=averageColors(paperA,paperB);
                }else if(inkA_state&&!inkB_state){
                    combinedColor=averageColors(inkA,paperB);
                }else if(!inkA_state&&inkB_state){
                    combinedColor=averageColors(paperA,inkB);
                }else{
                    combinedColor=averageColors(inkA,inkB);
                }
                
                Color ref=new Color(referencePixels[pixelIndex++]); 
                totalErrorSq+=colorDistanceSq(combinedColor,ref); 
            } 
        } 
        return totalErrorSq;
    }
    // --- END Added Interlace Helper Methods ---

    // --- Inner Classes ---

    // Preview Worker
    private class PreviewWorker extends SwingWorker<ImageProcessor, Void> {
        private final PreviewParameters params;
        private volatile Exception error = null;

        PreviewWorker(PreviewParameters params) {
            this.params = params;
        }

        @Override
        protected ImageProcessor doInBackground() throws Exception {
            long startTime = System.currentTimeMillis();
            IJ.showStatus("Processing preview...");
            ImageProcessor resultIp = null;
            // Duplicate the source so we don't block the UI image
            ImageProcessor sourceCopy = params.sourceProcessor.duplicate();
            try {
                processImage(
                    sourceCopy,
                    params.blockSizeX,
                    params.blockSizeY,
                    params.isInterlaceEnabled,
                    params.ditheringMode,
                    params.colorMode,
                    params.activeDitherPalette,
                    params.customPalette,
                    params.paperA,
                    params.inkA,
                    params.paperB,
                    params.inkB,
                    params.ditheringLevel,
                    params.brightness,
                    params.contrast,
                    params.gamma,
                    params.brightAttributeThreshold
                );
                if (isCancelled()) {
                    return null;
                }
                resultIp = sourceCopy;
                long endTime = System.currentTimeMillis();
                IJ.log("Preview processed in " + (endTime - startTime) + " ms.");
            } catch (Exception e) {
                error = e;
                IJ.log("!!! EXCEPTION in PreviewWorker.doInBackground !!!");
                e.printStackTrace();
                throw e;
            } finally {
                IJ.showStatus("Preview ready.");
            }
            return resultIp;
        }

        @Override
        protected void done() {
            // Only update UI if this is still the active worker
            if (this != currentWorker) {
                return;
            }
            try {
                if (isCancelled()) {
                    return;
                }
                ImageProcessor resultIp = get();  // may throw ExecutionException
                if (resultIp != null && previewImp != null && previewCanvas != null && paletteCanvas != null) {
                    previewImp.setProcessor(resultIp);
                    previewImp.updateAndDraw();
                    previewCanvas.repaint();
                    paletteCanvas.repaint();
                } else if (error != null) {
                    IJ.error("Preview Error", "Error during preview processing:\n" + error.getMessage());
                }
            }
            catch (CancellationException ce) {
                // user cancelled, ignore
            }
            catch (Exception e) {
                error = e;
                IJ.log("!!! Error during preview task completion or UI update !!!");
                e.printStackTrace();
                IJ.error("Preview Error", "Error retrieving preview result or updating UI:\n" + e.getMessage());
            }
            finally {
                // Clear the worker reference so a new one can be started
                if (currentWorker == this) {
                    currentWorker = null;
                }
            }
        }
    } // End PreviewWorker class

    // Parameter object for the PreviewWorker
    private static class PreviewParameters { 
        final ImageProcessor sourceProcessor; 
        final int blockSizeX, blockSizeY; 
        final DitheringMode ditheringMode; 
        final ColorMode colorMode; 
        final Color[] activeDitherPalette, customPalette; 
        final double ditheringLevel, brightness, contrast, gamma, brightAttributeThreshold; 
        final boolean isInterlaceEnabled; 
        final UserColorSelection paperA, inkA, paperB, inkB; 
        
        PreviewParameters(ImageProcessor s, int bx, int by, DitheringMode dm, ColorMode cm, Color[] ap, Color[] cp, 
                        double dl, double br, double co, double ga, double bt, boolean ie, 
                        UserColorSelection pa, UserColorSelection ia, UserColorSelection pb, UserColorSelection ib ) { 
            sourceProcessor=s; 
            blockSizeX=bx; 
            blockSizeY=by; 
            ditheringMode=dm; 
            colorMode=cm; 
            activeDitherPalette=ap; 
            customPalette=cp; 
            ditheringLevel=dl; 
            brightness=br; 
            contrast=co; 
            gamma=ga; 
            brightAttributeThreshold=bt; 
            isInterlaceEnabled=ie; 
            paperA=pa; 
            inkA=ia; 
            paperB=pb; 
            inkB=ib; 
        } 
    } // End PreviewParameters class

    /**
     * Error-diffusion in Lab space (Floyd-Steinberg example).
     * You can port this pattern to your other kernels.
     */
    BufferedImage labErrorDiffusion(BufferedImage rgb, DitheringMode mode, Color[] paletteRGB, double level) {
        ensureLabBuffers(rgb);
        computePaletteLab(paletteRGB);

        int W = imgW, H = imgH;
        float[][][] lab = new float[H][W][3];
        float[][][] err = new float[H][W][3];

        // fill lab directly
        for (int y = 0, idx = 0; y < H; y++) {
            for (int x = 0; x < W; x++, idx++) {
                lab[y][x][0] = Lbuf[idx];
                lab[y][x][1] = abuf[idx];
                lab[y][x][2] = bbuf[idx];
            }
        }

        // output image
        BufferedImage out = new BufferedImage(W,H,BufferedImage.TYPE_INT_RGB);

        // FS weights
        float w1 = 7f/16f, w2 = 3f/16f, w3 = 5f/16f, w4 = 1f/16f;

        for(int y=0; y<H; y++){
            for(int x=0; x<W; x++){
                // apply accumulated error
                float Lc = lab[y][x][0] + err[y][x][0];
                float ac = lab[y][x][1] + err[y][x][1];
                float bc = lab[y][x][2] + err[y][x][2];

                // find nearest palette index in paletteLab (CIE76)
                int bestIdx = 0;
                float bestDist = Float.MAX_VALUE;
                for(int i=0;i<paletteLab.length;i++){
                    float dL = Lc - paletteLab[i][0];
                    float da = ac - paletteLab[i][1];
                    float db = bc - paletteLab[i][2];
                    float dist = dL*dL + da*da + db*db;
                    if(dist<bestDist){ bestDist=dist; bestIdx=i; }
                }

                // write out the RGB corresponding to that index
                out.setRGB(x,y, paletteRGB[bestIdx].getRGB());

                // compute quant error in Lab
                float eL = Lc - paletteLab[bestIdx][0];
                float ea = ac - paletteLab[bestIdx][1];
                float eb = bc - paletteLab[bestIdx][2];

                // distribute to neighbors
                if(x+1 < W){
                    err[y  ][x+1][0] += eL * w1;
                    err[y  ][x+1][1] += ea * w1;
                    err[y  ][x+1][2] += eb * w1;
                }
                if(x>0 && y+1 < H){
                    err[y+1][x-1][0] += eL * w2;
                    err[y+1][x-1][1] += ea * w2;
                    err[y+1][x-1][2] += eb * w2;
                }
                if(y+1 < H){
                    err[y+1][x  ][0] += eL * w3;
                    err[y+1][x  ][1] += ea * w3;
                    err[y+1][x  ][2] += eb * w3;
                }
                if(x+1 < W && y+1 < H){
                    err[y+1][x+1][0] += eL * w4;
                    err[y+1][x+1][1] += ea * w4;
                    err[y+1][x+1][2] += eb * w4;
                }
            }
        }
        return out;
    }

    /**
     * Ordered dithering in Lab by thresholding the L* channel.
     */
    BufferedImage labOrderedDither(BufferedImage rgb, int matrixSize,
                                 Color[] paletteRGB, double level) {
        ensureLabBuffers(rgb);
        computePaletteLab(paletteRGB);
        int[][] m = getBayerMatrix(matrixSize);
        int N = matrixSize, W = imgW, H = imgH;
        BufferedImage out = new BufferedImage(W, H, BufferedImage.TYPE_INT_RGB);

        for (int y = 0, idx = 0; y < H; y++) {
            for (int x = 0; x < W; x++, idx++) {
                float Lc = Lbuf[idx];
                float ac = abuf[idx];
                float bc = bbuf[idx];

                // reorder threshold into L* range
                float cell = m[y % N][x % N] / (float)(N * N);
                float thr  = cell * 100f * (float)level - 50f * (float)level;
                Lc = clampF(Lc + thr);

                // pick closest Lab
                int best = 0;
                float bestD = Float.MAX_VALUE;
                for (int i = 0; i < paletteLab.length; i++) {
                    float dL = Lc - paletteLab[i][0],
                          da = ac - paletteLab[i][1],
                          db = bc - paletteLab[i][2],
                          dist = dL*dL + da*da + db*db;
                    if (dist < bestD) {
                        bestD = dist;
                        best  = i;
                    }
                }
                out.setRGB(x, y, paletteRGB[best].getRGB());
            }
        }
        return out;
    }

    private float clampF(float v) {
        return Math.max(0f, Math.min(100f, v));  // clamp into [0..100]
    }

    private void ensureLabBuffers(BufferedImage img) {
        int W = img.getWidth();
        int H = img.getHeight();
        int size = W * H;

        // re-alloc only if dimensions changed
        if (Lbuf == null || Lbuf.length != size) {
            imgW = W;
            imgH = H;
            Lbuf = new float[size];
            abuf = new float[size];
            bbuf = new float[size];

            // fetch all pixels
            int[] rgbArr = new int[size];
            img.getRGB(0, 0, W, H, rgbArr, 0, W);

            // convert to Lab and store directly into float[]'s
            for (int i = 0; i < size; i++) {
                // rgbArr[i] is 0xAARRGGBB
                int rgb = rgbArr[i];
                int R = (rgb >> 16) & 0xFF;
                int G = (rgb >>  8) & 0xFF;
                int B = ( rgb       & 0xFF);
                float[] lab = rgbToLab(R, G, B);
                Lbuf[i] = lab[0];
                abuf[i] = lab[1];
                bbuf[i] = lab[2];
            }
        }
    }

    /**
     * Convert sRGB [0..255] → CIELAB {L*,a*,b*}
     */
    private float[] RGBtoLab(int rgb) {
        int R = (rgb >> 16) & 0xFF;
        int G = (rgb >>  8) & 0xFF;
        int B = ( rgb        & 0xFF);
        // now just call your existing routine:
        return rgbToLab(R, G, B);
    }

    private float[] rgbToLab(int R, int G, int B) {
        // 1) linearize sRGB
        float r = R/255f, g = G/255f, b = B/255f;
        r = (r > 0.04045f) ? (float)Math.pow((r + .055f)/1.055f, 2.4f) : r/12.92f;
        g = (g > 0.04045f) ? (float)Math.pow((g + .055f)/1.055f, 2.4f) : g/12.92f;
        b = (b > 0.04045f) ? (float)Math.pow((b + .055f)/1.055f, 2.4f) : b/12.92f;

        // 2) to XYZ (D65)
        float X = r*0.4124f + g*0.3576f + b*0.1805f;
        float Y = r*0.2126f + g*0.7152f + b*0.0722f;
        float Z = r*0.0193f + g*0.1192f + b*0.9505f;

        // 3) normalize by reference white
        X /= 0.95047f;  Y /= 1.00000f;  Z /= 1.08883f;

        // 4) f(t) for Lab
        X = (X > 0.008856f) ? (float)Math.cbrt(X) : (7.787f*X + 16f/116f);
        Y = (Y > 0.008856f) ? (float)Math.cbrt(Y) : (7.787f*Y + 16f/116f);
        Z = (Z > 0.008856f) ? (float)Math.cbrt(Z) : (7.787f*Z + 16f/116f);

        // 5) assemble L*, a*, b*
        float L = 116f * Y - 16f;
        float a = 500f * (X - Y);
        float b2= 200f * (Y - Z);

        return new float[]{L, a, b2};
    }

    /**
     * Precompute the Lab coordinates of every entry in 'paletteRGB'.
     * Must be called once per frame (after ensureLabBuffers).
     */
    private void computePaletteLab(Color[] paletteRGB) {
        int N = paletteRGB.length;
        // allocate or re-allocate if palette size changed
        if (paletteLab == null || paletteLab.length != N) {
            paletteLab = new float[N][3];
        }
        // convert each Color → Lab via rgbToLab(...)  
        for (int i = 0; i < N; i++) {
            Color c = paletteRGB[i];
            float[] lab = rgbToLab(c.getRed(), c.getGreen(), c.getBlue());
            paletteLab[i][0] = lab[0];
            paletteLab[i][1] = lab[1];
            paletteLab[i][2] = lab[2];
        }
    }

    /**
     * Computes the Lab centroid of the block at (bx,by) of size (bw×bh).
     *  - Lbuf[] is in 0…100
     *  - abuf[], bbuf[] are Lab-axes shifted by +128 (i.e. in 0…255).
     */
    private float[] blockCentroidLab(int bx, int by, int bw, int bh) {
        float sumL  = 0f,
              suma  = 0f,
              sumb  = 0f;
        int   W     = imgW;

        for (int y = by; y < by + bh; y++) {
            int base = y * W;
            for (int x = bx; x < bx + bw; x++) {
                int idx = base + x;
                sumL += Lbuf[idx];
                suma += abuf[idx];
                sumb += bbuf[idx];
            }
        }

        float invCount = 1f / (bw * bh);
        float Lc  = sumL * invCount;          // 0…100
        float ac  = suma * invCount - 128f;   // back into –128…+127
        float bc  = sumb * invCount - 128f;   // back into –128…+127

        return new float[]{ Lc, ac, bc };
    }

    /**
     * Returns the indices of the K palette entries whose Lab distance 
     * to 'centroid' is smallest (using squared Euclidean).
     */
    private int[] topKCandidates(float[] centroid) {
        int n = paletteLab.length;
        FloatIndex[] arr = new FloatIndex[n];
        for (int i = 0; i < n; i++) {
            float dL = paletteLab[i][0] - centroid[0],
                  da = paletteLab[i][1] - centroid[1],
                  db = paletteLab[i][2] - centroid[2];
            arr[i] = new FloatIndex(dL*dL + da*da + db*db, i);
        }
        Arrays.sort(arr, Comparator.comparingDouble(fi -> fi.error));
        int k = Math.min(K, n);
        int[] top = new int[k];
        for (int i = 0; i < k; i++) top[i] = arr[i].idx;
        return top;
    }

    // helper struct for sorting
    private static class FloatIndex {
        final double error;
        final int    idx;
        FloatIndex(double error, int idx) {
            this.error = error;
            this.idx   = idx;
        }
    }

} // End of ZX_Spectrum_Converter7 class