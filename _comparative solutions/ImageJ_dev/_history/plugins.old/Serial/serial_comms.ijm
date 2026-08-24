run("serial ext");

Ext.open("COM1",14400,"DATABITS_8 STOPBITS_2 PARITY_ODD"); // advanced serial port configuration

// Available options

// DEFAULT: 8 data bits, 1 stop bit, no parity
 
// Databits:
// DATABITS_5
// DATABITS_6
// DATABITS_7
// DATABITS_8

// Stopbits:
// STOPBITS_1
// STOPBITS_2
// STOPBITS_1_5

// Parity:
// PARITY_NONE
// PARITY_EVEN
// PARITY_ODD
// PARITY_MARK
// PARITY_SPACE

// Read what the serial device sends:
data = Ext.read();

// Send a string command to the serial device:
Ext.write("a");

//Poll if a serial connection is already there:
active = Ext.alive();
// returns "0" or "1"

// Close the active serial port:
Ext.close();

