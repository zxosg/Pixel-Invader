x=0;

for (i=0; i<3; i++) {
 for (j=0; j<3; j++) {
  for (a=0; a<=4; a++) {
   for (b=0; b<=4; b++) {
    setResult("id",x,x);
    setResult("col1",x,b);
    setResult("col2",x,a);
    setResult("i1",x,j);
    setResult("i2",x,i);
    x++;
   }
  }
 }
}
updateResults;
