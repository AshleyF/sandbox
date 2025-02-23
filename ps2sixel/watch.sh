clear
while true; do
  echo "\033[H"
  gs -r100 -dQUIET -sDEVICE=pngalpha -o - test.ps | img2sixel
  sleep 0.5
done

