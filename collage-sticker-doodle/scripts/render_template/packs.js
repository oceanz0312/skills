// Style packs. Everything a pack sets is DECORATIVE; P0 geometry (overflow, two positions, layer order, block size, info, completeness, occlusion) is never touched by packs.
// palettes: [main(full-page base sheet), accent(big stacked sheet), card paper]. One palette per scene, seeded, never the same twice in a row.
const PACKS={
 scrapbook:{label:"手账 scrapbook",ink:"#2E2326",light:"#FBF5EC",penInk:"#1A1A22",tex:"crumpled",texK:1,grain:0.04,
   palettes:[["#F0DCD2","#C45A4D","#F7EDE3"],["#F4D877","#5DAD7E","#F7EDE3"],["#5DAD7E","#F4D877","#DCC8AE"],["#C45A4D","#E9B08A","#F7EDE3"],["#B7D5C7","#F4D877","#F7EDE3"],["#D7D6E6","#6C809E","#F7EDE3"],["#EEA8BF","#C3554B","#F7EDE3"]],
   shapes:["diag","side","arch"],en:["Reenie Beanie","Caveat","Homemade Apple","Nothing You Could Do"],ransomFonts:["Caveat","Dancing Script","Kalam"],zh:"Ma Shan Zheng",
   stickers:["heart","star","flower","tape","sparkle","smiley","tag","washi"],doodles:["scribble","arrow","zigzag","hearts"],stickerBorder:"#FFFFFF",density:[1,3],
   intros:["tv","badge","ransom","polaroid"],outros:["card","wall"],transitions:["pan","pan","cut","tear"],flash:["ab","jump","ab2"],boil:[1],masks:null,photoFilter:null,photoBorder:null},
 magazine:{label:"杂志剪报 magazine clipping",ink:"#111111",light:"#FFFFFF",penInk:"#111111",tex:"newsprint",texK:1.1,grain:0.05,
   palettes:[["#F2EFE8","#E63946","#FFFFFF"],["#E63946","#F2EFE8","#FFFFFF"],["#1D3557","#F1C40F","#FFFFFF"],["#F1C40F","#111111","#FFFFFF"],["#F2EFE8","#1D3557","#FFFFFF"],["#FF8FAB","#111111","#FFFFFF"]],
   shapes:["diag","side"],en:["Kalam","Caveat","Dancing Script"],ransomFonts:["Kalam","Caveat","Dancing Script","Homemade Apple"],zh:"ZCOOL KuaiLe",
   stickers:["tag","bubble","arrowSticker","star","dots","check","asterisk","burst"],doodles:["arrow","underline","circleMark"],stickerBorder:"#FFFFFF",density:[1,2],
   intros:["ransom","polaroid"],outros:["stamp","filmstrip"],transitions:["cut","stamp","cut","pan"],flash:["ab","stutter"],boil:[1,0.5],masks:["torn","circle","blob","arch"],photoFilter:"saturate(0.85) contrast(1.08)",photoBorder:"#FFFFFF"},
 "retro-poster":{label:"复古海报 retro poster",ink:"#2B2118",light:"#F5ECD7",penInk:"#1A1A22",tex:"halftone",texK:0.9,grain:0.06,
   palettes:[["#E9C46A","#2A9D8F","#F5ECD7"],["#2A9D8F","#E76F51","#F5ECD7"],["#E76F51","#F4A261","#F5ECD7"],["#264653","#E9C46A","#F5ECD7"],["#F4A261","#264653","#F5ECD7"]],
   shapes:["arch","diag"],en:["Dancing Script","Homemade Apple","Caveat"],ransomFonts:["Dancing Script","Caveat"],zh:"Zhi Mang Xing",
   stickers:["sun","star","crown","dots","bolt","tag","burst"],doodles:["rays","zigzag","arrow"],stickerBorder:"#F5ECD7",density:[1,2],
   intros:["badge","tv"],outros:["stamp","card"],transitions:["pan","stamp","pan","cut"],flash:["jump","ab2"],boil:[1],masks:["arch","circle","skyline","torn"],photoFilter:"sepia(0.35) saturate(0.7) contrast(1.05)",photoBorder:"#F5ECD7"},
 graffiti:{label:"街头涂鸦 street graffiti",ink:"#101010",light:"#F4F4F0",penInk:"#101010",tex:"concrete",texK:1.2,grain:0.06,
   palettes:[["#9A9A96","#C6FF00","#F4F4F0"],["#5E5E5A","#FF3EA5","#F4F4F0"],["#B5B5AE","#00E5FF","#F4F4F0"],["#7A7A74","#FFB000","#F4F4F0"],["#2B2B2B","#C6FF00","#F4F4F0"]],
   shapes:["diag","side","arch"],en:["Kalam","Caveat","Reenie Beanie"],ransomFonts:["Kalam","Caveat"],zh:"ZCOOL KuaiLe",
   stickers:["bolt","star","crown","asterisk","smiley","spiral","bubble","burst"],doodles:["spray","zigzag","arrow","crownMark"],stickerBorder:"#FFFFFF",density:[2,3],
   intros:["ransom","badge"],outros:["wall","stamp"],transitions:["cut","tear","stamp","cut"],flash:["stutter","ab","jump"],boil:[0.5,1],masks:["torn","blob","circle","skyline"],photoFilter:"saturate(1.1) contrast(1.12)",photoBorder:"#FFFFFF"},
 zine:{label:"胶片小志 film zine",ink:"#111111",light:"#F7F5F0",penInk:"#111111",tex:"photocopy",texK:1.2,grain:0.07,
   palettes:[["#F7F5F0","#FF5FA2","#FFFFFF"],["#F7F5F0","#2F6BFF","#FFFFFF"],["#FF5FA2","#F7F5F0","#FFFFFF"],["#2F6BFF","#F7F5F0","#FFFFFF"],["#E8E4DA","#111111","#FFFFFF"]],
   shapes:["side","diag"],en:["Nothing You Could Do","Reenie Beanie","Homemade Apple"],ransomFonts:["Homemade Apple","Kalam","Caveat"],zh:"Long Cang",
   stickers:["tape","asterisk","check","dots","arrowSticker","spiral","tag","washi"],doodles:["underline","circleMark","arrow","scribble"],stickerBorder:"#FFFFFF",density:[1,2],
   intros:["polaroid","ransom"],outros:["filmstrip","card"],transitions:["cut","tear","pan"],flash:["ab2","jump","stutter"],boil:[1,0.5],masks:["torn","skyline","blob","arch"],photoFilter:"grayscale(1) contrast(1.35) brightness(1.05)",photoBorder:"#FFFFFF"}};
const LEVELS={low:{tilt:0.5,offset:0.5,wobble:0.5,extra:0},medium:{tilt:1,offset:1,wobble:1,extra:1},high:{tilt:1.6,offset:1.6,wobble:1.5,extra:2}};
