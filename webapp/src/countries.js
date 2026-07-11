// Full country list (ISO 3166-1 alpha-2). ADZUNA = codes Adzuna's API supports;
// others are still searched via the other sources through `locations`.
const RAW =
  "af:Afghanistan,al:Albania,dz:Algeria,ad:Andorra,ao:Angola,ar:Argentina,am:Armenia,au:Australia," +
  "at:Austria,az:Azerbaijan,bh:Bahrain,bd:Bangladesh,bb:Barbados,by:Belarus,be:Belgium,bz:Belize," +
  "bj:Benin,bt:Bhutan,bo:Bolivia,ba:Bosnia and Herzegovina,bw:Botswana,br:Brazil,bn:Brunei,bg:Bulgaria," +
  "bf:Burkina Faso,bi:Burundi,kh:Cambodia,cm:Cameroon,ca:Canada,cv:Cape Verde,cf:Central African Republic," +
  "td:Chad,cl:Chile,cn:China,co:Colombia,km:Comoros,cg:Congo,cd:Congo (DRC),cr:Costa Rica,hr:Croatia," +
  "cu:Cuba,cy:Cyprus,cz:Czechia,dk:Denmark,dj:Djibouti,do:Dominican Republic,ec:Ecuador,eg:Egypt," +
  "sv:El Salvador,gq:Equatorial Guinea,er:Eritrea,ee:Estonia,sz:Eswatini,et:Ethiopia,fj:Fiji,fi:Finland," +
  "fr:France,ga:Gabon,gm:Gambia,ge:Georgia,de:Germany,gh:Ghana,gr:Greece,gt:Guatemala,gn:Guinea," +
  "gy:Guyana,ht:Haiti,hn:Honduras,hk:Hong Kong,hu:Hungary,is:Iceland,in:India,id:Indonesia,ir:Iran," +
  "iq:Iraq,ie:Ireland,il:Israel,it:Italy,ci:Ivory Coast,jm:Jamaica,jp:Japan,jo:Jordan,kz:Kazakhstan," +
  "ke:Kenya,kw:Kuwait,kg:Kyrgyzstan,la:Laos,lv:Latvia,lb:Lebanon,ls:Lesotho,lr:Liberia,ly:Libya," +
  "li:Liechtenstein,lt:Lithuania,lu:Luxembourg,mo:Macau,mg:Madagascar,mw:Malawi,my:Malaysia,mv:Maldives," +
  "ml:Mali,mt:Malta,mr:Mauritania,mu:Mauritius,mx:Mexico,md:Moldova,mc:Monaco,mn:Mongolia,me:Montenegro," +
  "ma:Morocco,mz:Mozambique,mm:Myanmar,na:Namibia,np:Nepal,nl:Netherlands,nz:New Zealand,ni:Nicaragua," +
  "ne:Niger,ng:Nigeria,mk:North Macedonia,no:Norway,om:Oman,pk:Pakistan,ps:Palestine,pa:Panama," +
  "pg:Papua New Guinea,py:Paraguay,pe:Peru,ph:Philippines,pl:Poland,pt:Portugal,qa:Qatar,ro:Romania," +
  "ru:Russia,rw:Rwanda,sa:Saudi Arabia,sn:Senegal,rs:Serbia,sc:Seychelles,sl:Sierra Leone,sg:Singapore," +
  "sk:Slovakia,si:Slovenia,so:Somalia,za:South Africa,kr:South Korea,ss:South Sudan,es:Spain,lk:Sri Lanka," +
  "sd:Sudan,sr:Suriname,se:Sweden,ch:Switzerland,sy:Syria,tw:Taiwan,tj:Tajikistan,tz:Tanzania,th:Thailand," +
  "tg:Togo,tt:Trinidad and Tobago,tn:Tunisia,tr:Turkey,tm:Turkmenistan,ug:Uganda,ua:Ukraine," +
  "ae:United Arab Emirates,gb:United Kingdom,us:United States,uy:Uruguay,uz:Uzbekistan,ve:Venezuela," +
  "vn:Vietnam,ye:Yemen,zm:Zambia,zw:Zimbabwe";

export const COUNTRIES = RAW.split(",").map((s) => {
  const i = s.indexOf(":");
  return { c: s.slice(0, i), n: s.slice(i + 1) };
});

export const ADZUNA = new Set(["at", "au", "be", "br", "ca", "ch", "de", "es", "fr", "gb", "in", "it", "mx", "nl", "nz", "pl", "sg", "us", "za"]);

export const nameOf = (code) => (COUNTRIES.find((x) => x.c === code) || {}).n || code;
