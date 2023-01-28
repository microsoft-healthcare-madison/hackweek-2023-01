ls *.html | \
   grep -v .ttl.html | \
   grep -v shex |\
   grep -v .xml |\
   grep -v .xml.html |\
   grep -v extension- |\
   grep -v codesystem- |\
   grep -v -example | \
   grep -v qa.html | \
   grep -v 03 \
   > tomd
mkdir -p txt
for i in $(cat tomd) ; do 
    pandoc $i -t plain -o ./txt/${i%html}txt;
done

mkdir txt-simple
cd txt
rm *.profile.json.txt
rm *.schema.json.txt
rm *-profiles.txt
for i in *.txt; do  cat $i | awk '{if ($0 ~ /^[-+]+$/) {print "---"} else {print}}' | awk '{gsub(/ {9,}/, "")}; {print}'  |  awk '{gsub(/[-+| ]{3,}/, " ")}; {print}' |\
awk '{if ($0 == "Structure") {flag=flag+1} if ($0 ~ /^JSON Template/){flag=flag+1} if(flag==0 || flag == 2 ) {print}}' > ../txt-simple/$i; done


cd fhir # spec
cd source
mkdir plain
for x in `find . -type f -name "*-introduction*.xml" -or  -name "*-notes*.xml"`; do pandoc $x -f html -t plain > plain/$(basename ${x%xml}txt); done

for i in `seq 1 $(wc -l Info_R4B.txt)`;         do    tail -n +$i Info_R4B.txt | head  -n 1 > narrative/$i.info.txt;         done
