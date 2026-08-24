fpath = File.openDialog("Select a File");
flen  = File.length(fpath);
fstr  = File.openAsRawString(fpath, flen);
for (i=0; i<flen; i++)
	print(i+"    "+IJ.pad(toHex(charCodeAt(fstr, i)),2));
