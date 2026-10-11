// v5 presets. Per scene exactly ONE main colour (full-page base sheet) + ONE accent colour (big stacked sheet).
// 3rd value = info-card paper (neutral; cards are content, not colour blocks). Third block sheet (optional) is a tint of main.
const PRESETS={
 "retro-warm":{ink:"#3A282B",paper:"#F3E6DA",light:"#FBF5EC",
   scenes:{S1:["#F0DCD2","#C45A4D","#F7EDE3"],S2:["#F4D877","#5DAD7E","#F7EDE3"],S3:["#5DAD7E","#F4D877","#DCC8AE"],S4:["#C45A4D","#E9B08A","#F7EDE3"],S5:["#F4D877","#B7D5C7","#F7EDE3"],
     S6:["#7FA35A","#F4D877","#F7EDE3"],S7:["#A95842","#F0DCD2","#F7EDE3"],S8:["#D7D6E6","#6C809E","#F7EDE3"],S9:["#60AB7E","#F4D877","#EEA4BA"],S10:["#C3554B","#EEA8BF","#F7EDE3"]},
   shapes:["diag","side","arch"],props:["polaroid","flowers","camera","vinyl","wine","coupe","champ"],doodles:["hearts","wave","scribble"],
   en:["Reenie Beanie","Nothing You Could Do","Homemade Apple","Caveat","Dancing Script"],ransomFonts:["Caveat","Dancing Script","Kalam"],zhTitle:"Ma Shan Zheng",zhBody:"Ma Shan Zheng",penInk:"#1A1A22"},
 "morandi":{ink:"#4A4542",paper:"#EEE8DF",light:"#F7F3EC",
   scenes:{S1:["#E9E3DA","#B9A39A","#F4EFE8"],S2:["#D8CFC2","#A9B4AA","#F4EFE8"],S3:["#A9B4AA","#D8CFC2","#DCCDB8"],S4:["#B9A39A","#D6B98F","#F4EFE8"],S5:["#D8CFC2","#AFC0C6","#F4EFE8"],S6:["#A9B4AA","#D8CFC2","#F4EFE8"],S7:["#9E857C","#E9E3DA","#F4EFE8"],S8:["#CFCBD3","#8E98A6","#F4EFE8"],S9:["#A7B5A4","#D8CFC2","#C9A9A6"],S10:["#B9A39A","#C9A9A6","#F4EFE8"]},
   shapes:["diag","side","arch"],props:["polaroid","flowers","camera","vinyl","coupe"],doodles:["wave","scribble"],
   en:["Reenie Beanie","Nothing You Could Do","Homemade Apple","Caveat"],ransomFonts:["Caveat","Kalam"],zhTitle:"Ma Shan Zheng",zhBody:"Ma Shan Zheng",penInk:"#1A1A22"},
 "summer-island":{ink:"#21374A",paper:"#FFF3DD",light:"#FFFAF0",
   scenes:{S1:["#FFF3DD","#FF7A59","#FFFAF0"],S2:["#FFD45C","#2EC4B6","#FFFAF0"],S3:["#2EC4B6","#FFD45C","#F4E1C1"],S4:["#FF7A59","#FFB347","#FFFAF0"],S5:["#FFD45C","#8FD6E1","#FFFAF0"],S6:["#7BC67B","#FFD45C","#FFFAF0"],S7:["#FF7A59","#FFF3DD","#FFFAF0"],S8:["#BDE7EF","#3A86C8","#FFFAF0"],S9:["#2EC4B6","#FFD45C","#FF8FAB"],S10:["#FF7A59","#FF8FAB","#FFFAF0"]},
   shapes:["diag","side","arch"],props:["polaroid","flowers","camera","coupe","champ"],doodles:["hearts","wave","scribble"],
   en:["Reenie Beanie","Caveat","Dancing Script","Nothing You Could Do"],ransomFonts:["Caveat","Dancing Script","Kalam"],zhTitle:"Ma Shan Zheng",zhBody:"Ma Shan Zheng",penInk:"#1A1A22"},
 "film-night":{ink:"#F2E6CF",paper:"#3A3640",light:"#F2E6CF",
   scenes:{S1:["#2B2A33","#8C3B3B","#3A3640"],S2:["#3A3550","#C8A24A","#3A3640"],S3:["#3A3550","#5E6B4E","#CDB89A"],S4:["#5A2E2E","#C8743A","#3A3640"],S5:["#2E3550","#56708C","#3A3640"],S6:["#3A3550","#5E6B4E","#3A3640"],S7:["#5A2E2E","#CDB89A","#3A3640"],S8:["#33384A","#56708C","#3A3640"],S9:["#2F4A3E","#C8A24A","#B7657B"],S10:["#5A2E2E","#B7657B","#3A3640"]},
   shapes:["diag","side","arch"],props:["polaroid","vinyl","wine","coupe","camera"],doodles:["wave","scribble","hearts"],
   en:["Reenie Beanie","Caveat","Homemade Apple"],ransomFonts:["Caveat","Kalam"],zhTitle:"Ma Shan Zheng",zhBody:"Ma Shan Zheng",penInk:"#1A1A22"}};
// randomness levels: multiply decorative ranges ONLY (never P0 geometry: those are re-checked after every roll)
const LEVELS={low:{tilt:0.5,offset:0.5,wobble:0.5,extra:0},medium:{tilt:1,offset:1,wobble:1,extra:1},high:{tilt:1.6,offset:1.6,wobble:1.5,extra:2}};
