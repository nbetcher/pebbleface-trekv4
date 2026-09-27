

#pragma once


// Forward declarations
void update_time();


// This works around the inability to use the current GRect macro for constants
#define ConstantGRect(x, y, w, h) {{(x), (y)}, {(w), (h)}}


// Day line information
static const char *day_lines[] = { "Mo  Tu  We  Th  Fr  Sa  Su"
                                 , "Ma  Di  Wo  Do  Vr  Za  Zo"
                                 , "Mo  Di  Mi  Do  Fr  Sa  So"
                                 , "Lu  Ma  Me  Je  Ve  Sa  Di"
                                 , "Po  Vt  Sr  Ce  Pe  Su  Ne"
                                 , "Lu  Ma  Mi  Ju  Vi  Sá  Do"
                                 , "Lu  Ma  Me  Gi  Ve  Sa  Do"
                                 , "Ma  Ti  On  To  Fr  Lø  Sø"
                                 , "Må  Ti  On  To  Fr  Lö  Sö"
                                 , "Ma  Ti  Ke  To  Pe  La  Su"
                                 , "Ma  Ti  On  To  Fr  Lø  Sø"
								 , "Pt  Sa  Ça  Pe  Cu  Ct  Pz"
								 , "Dl  Dt  Dc  Dj  Dv  Ds  Dg"
								 , "Po  Ut  St  Št  Pi  So  Ne"
								 , "Se  Te  Qu  Qi  Se  Sá  Do"
								 , "H   K   Sz  Cs  P   Sz  V"
								 , "Po  Út  St  Čt  Pá  So  Ne"
                                 };

static const char *day_lines2[] = { "Su  Mo  Tu  We  Th  Fr  Sa"
                                 , "Zo  Ma  Di  Wo  Do  Vr  Za"
                                 , "So  Mo  Di  Mi  Do  Fr  Sa"
                                 , "Di  Lu  Ma  Me  Je  Ve  Sa"
                                 , "Ne  Po  Vt  Sr  Ce  Pe  Su"
                                 , "Do  Lu  Ma  Mi  Ju  Vi  Sá"
                                 , "Do  Lu  Ma  Me  Gi  Ve  Sa"
                                 , "Sø  Ma  Ti  On  To  Fr  Lø"
                                 , "Sö  Må  Ti  On  To  Fr  Lö"
                                 , "Su  Ma  Ti  Ke  To  Pe  La"
                                 , "Sø  Ma  Ti  On  To  Fr  Lø"
								 , "Pz  Pt  Sa  Ça  Pe  Cu  Ct"
								 , "Dg  Dl  Dt  Dc  Dj  Dv  Ds"
								 , "Ne  Po  Ut  St  Št  Pi  So"
								 , "Do  Se  Te  Qu  Qi  Se  Sá"
								 , "V   H   K   Sz  Cs  P   Sz"
								 , "Ne  Po  Út  St  Čt  Pá  So"
                                 };

// GRect for day highlights

static const GRect highlight_rect[][7] = { { ConstantGRect( 16, 98, 18, 20 ) , ConstantGRect( 35, 98, 18, 20 ) , ConstantGRect( 55, 98, 18, 20 ) , ConstantGRect( 74, 98, 18, 20 ) , ConstantGRect( 92, 98, 18, 20 ) , ConstantGRect( 109, 98, 18, 20 ) , ConstantGRect( 126, 98, 18, 20 ) }
                                         , { ConstantGRect( 16, 98, 18, 20 ) , ConstantGRect( 35, 98, 18, 20 ) , ConstantGRect( 52, 98, 18, 20 ) , ConstantGRect( 73, 98, 18, 20 ) , ConstantGRect( 91, 98, 18, 20 ) , ConstantGRect( 109, 98, 18, 20 ) , ConstantGRect( 124, 98, 18, 20 ) }
                                         , { ConstantGRect( 16, 98, 18, 20 ) , ConstantGRect( 35, 98, 18, 20 ) , ConstantGRect( 51, 98, 18, 20 ) , ConstantGRect( 70, 98, 18, 20 ) , ConstantGRect( 89, 98, 18, 20 ) , ConstantGRect( 105, 98, 18, 20 ) , ConstantGRect( 123, 98, 18, 20 ) }
                                         , { ConstantGRect( 15, 98, 18, 20 ) , ConstantGRect( 33, 98, 18, 20 ) , ConstantGRect( 53, 98, 18, 20 ) , ConstantGRect( 73, 98, 18, 20 ) , ConstantGRect( 92, 98, 18, 20 ) , ConstantGRect( 110, 98, 18, 20 ) , ConstantGRect( 126, 98, 18, 20 ) }
                                         , { ConstantGRect( 15, 98, 18, 20 ) , ConstantGRect( 32, 98, 18, 20 ) , ConstantGRect( 48, 98, 18, 20 ) , ConstantGRect( 67, 98, 18, 20 ) , ConstantGRect( 83, 98, 18, 20 ) , ConstantGRect( 101, 98, 18, 20 ) , ConstantGRect( 119, 98, 18, 20 ) }
                                         , { ConstantGRect( 15, 98, 18, 20 ) , ConstantGRect( 33, 98, 18, 20 ) , ConstantGRect( 53, 98, 18, 20 ) , ConstantGRect( 71, 98, 18, 20 ) , ConstantGRect( 87, 98, 18, 20 ) , ConstantGRect( 104, 98, 18, 20 ) , ConstantGRect( 122, 98, 18, 20 ) }
                                         , { ConstantGRect( 15, 98, 18, 20 ) , ConstantGRect( 33, 98, 18, 20 ) , ConstantGRect( 54, 98, 18, 20 ) , ConstantGRect( 72, 98, 18, 20 ) , ConstantGRect( 89, 98, 18, 20 ) , ConstantGRect( 107, 98, 18, 20 ) , ConstantGRect( 124, 98, 18, 20 ) }
                                         , { ConstantGRect( 15, 98, 18, 20 ) , ConstantGRect( 33, 98, 18, 20 ) , ConstantGRect( 51, 98, 18, 20 ) , ConstantGRect( 72, 98, 18, 20 ) , ConstantGRect( 89, 98, 18, 20 ) , ConstantGRect( 107, 98, 18, 20 ) , ConstantGRect( 124, 98, 18, 20 ) }
                                         , { ConstantGRect( 16, 98, 18, 20 ) , ConstantGRect( 35, 98, 18, 20 ) , ConstantGRect( 51, 98, 18, 20 ) , ConstantGRect( 70, 98, 18, 20 ) , ConstantGRect( 87, 98, 18, 20 ) , ConstantGRect( 104, 98, 18, 20 ) , ConstantGRect( 120, 98, 18, 20 ) }
                                         , { ConstantGRect( 16, 98, 18, 20 ) , ConstantGRect( 35, 98, 18, 20 ) , ConstantGRect( 51, 98, 18, 20 ) , ConstantGRect( 69, 98, 18, 20 ) , ConstantGRect( 87, 98, 18, 20 ) , ConstantGRect( 104, 98, 18, 20 ) , ConstantGRect( 121, 98, 18, 20 ) }
                                         , { ConstantGRect( 16, 98, 18, 20 ) , ConstantGRect( 34, 98, 18, 20 ) , ConstantGRect( 51, 98, 18, 20 ) , ConstantGRect( 69, 98, 18, 20 ) , ConstantGRect( 87, 98, 18, 20 ) , ConstantGRect( 104, 98, 18, 20 ) , ConstantGRect( 121, 98, 18, 20 ) }
                                         , { ConstantGRect( 13, 98, 18, 20 ) , ConstantGRect( 31, 98, 18, 20 ) , ConstantGRect( 48, 98, 18, 20 ) , ConstantGRect( 67, 98, 18, 20 ) , ConstantGRect( 85, 98, 18, 20 ) , ConstantGRect( 101, 98, 18, 20 ) , ConstantGRect( 118, 98, 18, 20 ) }
                                         , { ConstantGRect( 12, 98, 18, 20 ) , ConstantGRect( 30, 98, 18, 20 ) , ConstantGRect( 47, 98, 18, 20 ) , ConstantGRect( 65, 98, 18, 20 ) , ConstantGRect( 83, 98, 18, 20 ) , ConstantGRect( 101, 98, 18, 20 ) , ConstantGRect( 120, 98, 18, 20 ) }
                                         , { ConstantGRect( 14, 98, 18, 20 ) , ConstantGRect( 32, 98, 18, 20 ) , ConstantGRect( 47, 98, 18, 20 ) , ConstantGRect( 63, 98, 18, 20 ) , ConstantGRect( 78, 98, 18, 20 ) , ConstantGRect( 94, 98, 18, 20 ) , ConstantGRect( 113, 98, 18, 20 ) }
                                         , { ConstantGRect( 14, 98, 18, 20 ) , ConstantGRect( 32, 98, 18, 20 ) , ConstantGRect( 50, 98, 18, 20 ) , ConstantGRect( 68, 98, 18, 20 ) , ConstantGRect( 86, 98, 18, 20 ) , ConstantGRect( 102, 98, 18, 20 ) , ConstantGRect( 113, 98, 18, 20 ) }
                                         , { ConstantGRect( 14, 98, 17, 20 ) , ConstantGRect( 29, 98, 17, 20 ) , ConstantGRect( 44, 98, 18, 20 ) , ConstantGRect( 63, 98, 18, 20 ) , ConstantGRect( 78, 98, 17, 20 ) , ConstantGRect( 94, 98, 18, 20 ) , ConstantGRect( 111, 98, 18, 20 ) }
                                         , { ConstantGRect( 14, 98, 17, 20 ) , ConstantGRect( 32, 98, 17, 20 ) , ConstantGRect( 48, 98, 16, 20 ) , ConstantGRect( 62, 98, 16, 20 ) , ConstantGRect( 78, 98, 17, 20 ) , ConstantGRect( 97, 98, 16, 20 ) , ConstantGRect( 116, 98, 18, 20 ) }
                                         };


static const GRect highlight_rect2[][7] = { { ConstantGRect( 15, 98, 18, 20 ) , ConstantGRect( 34, 98, 18, 20 ) , ConstantGRect( 54, 98, 18, 20 ) , ConstantGRect( 72, 98, 18, 20 ) , ConstantGRect( 93, 98, 18, 20 ) , ConstantGRect( 109, 98, 18, 20 ) , ConstantGRect( 126, 98, 18, 20 ) }
                                         , { ConstantGRect( 15, 98, 18, 20 ) , ConstantGRect( 32, 98, 18, 20 ) , ConstantGRect( 52, 98, 18, 20 ) , ConstantGRect( 70, 98, 18, 20 ) , ConstantGRect( 91, 98, 18, 20 ) , ConstantGRect( 109, 98, 18, 20 ) , ConstantGRect( 125, 98, 18, 20 ) }
                                         , { ConstantGRect( 16, 98, 18, 20 ) , ConstantGRect( 35, 98, 18, 20 ) , ConstantGRect( 54, 98, 18, 20 ) , ConstantGRect( 70, 98, 18, 20 ) , ConstantGRect( 89, 98, 18, 20 ) , ConstantGRect( 105, 98, 18, 20 ) , ConstantGRect( 123, 98, 18, 20 ) }
                                         , { ConstantGRect( 14, 98, 18, 20 ) , ConstantGRect( 31, 98, 18, 20 ) , ConstantGRect( 50, 98, 18, 20 ) , ConstantGRect( 71, 98, 18, 20 ) , ConstantGRect( 90, 98, 18, 20 ) , ConstantGRect( 108, 98, 18, 20 ) , ConstantGRect( 126, 98, 18, 20 ) }
                                         , { ConstantGRect( 15, 98, 18, 20 ) , ConstantGRect( 34, 98, 18, 20 ) , ConstantGRect( 51, 98, 18, 20 ) , ConstantGRect( 67, 98, 18, 20 ) , ConstantGRect( 85, 98, 18, 20 ) , ConstantGRect( 103, 98, 18, 20 ) , ConstantGRect( 121, 98, 18, 20 ) }
                                         , { ConstantGRect( 15, 98, 18, 20 ) , ConstantGRect( 33, 98, 18, 20 ) , ConstantGRect( 53, 98, 18, 20 ) , ConstantGRect( 71, 98, 18, 20 ) , ConstantGRect( 89, 98, 18, 20 ) , ConstantGRect( 106, 98, 18, 20 ) , ConstantGRect( 122, 98, 18, 20 ) }
                                         , { ConstantGRect( 15, 98, 18, 20 ) , ConstantGRect( 33, 98, 18, 20 ) , ConstantGRect( 53, 98, 18, 20 ) , ConstantGRect( 71, 98, 18, 20 ) , ConstantGRect( 89, 98, 18, 20 ) , ConstantGRect( 106, 98, 18, 20 ) , ConstantGRect( 122, 98, 18, 20 ) }
                                         , { ConstantGRect( 15, 98, 18, 20 ) , ConstantGRect( 33, 98, 18, 20 ) , ConstantGRect( 52, 98, 18, 20 ) , ConstantGRect( 72, 98, 18, 20 ) , ConstantGRect( 88, 98, 18, 20 ) , ConstantGRect( 105, 98, 18, 20 ) , ConstantGRect( 122, 98, 18, 20 ) }
                                         , { ConstantGRect( 16, 98, 18, 20 ) , ConstantGRect( 35, 98, 18, 20 ) , ConstantGRect( 51, 98, 18, 20 ) , ConstantGRect( 70, 98, 18, 20 ) , ConstantGRect( 87, 98, 18, 20 ) , ConstantGRect( 104, 98, 18, 20 ) , ConstantGRect( 121, 98, 18, 20 ) }
                                         , { ConstantGRect( 15, 98, 18, 20 ) , ConstantGRect( 35, 98, 18, 20 ) , ConstantGRect( 52, 98, 18, 20 ) , ConstantGRect( 69, 98, 18, 20 ) , ConstantGRect( 87, 98, 18, 20 ) , ConstantGRect( 104, 98, 18, 20 ) , ConstantGRect( 122, 98, 18, 20 ) }
                                         , { ConstantGRect( 15, 98, 18, 20 ) , ConstantGRect( 34, 98, 18, 20 ) , ConstantGRect( 52, 98, 18, 20 ) , ConstantGRect( 69, 98, 18, 20 ) , ConstantGRect( 87, 98, 18, 20 ) , ConstantGRect( 104, 98, 18, 20 ) , ConstantGRect( 122, 98, 18, 20 ) }
                                         , { ConstantGRect( 13, 98, 18, 20 ) , ConstantGRect( 31, 98, 18, 20 ) , ConstantGRect( 48, 98, 18, 20 ) , ConstantGRect( 66, 98, 18, 20 ) , ConstantGRect( 86, 98, 18, 20 ) , ConstantGRect( 101, 98, 18, 20 ) , ConstantGRect( 118, 98, 18, 20 ) }
                                         , { ConstantGRect( 12, 98, 18, 20 ) , ConstantGRect( 30, 98, 18, 20 ) , ConstantGRect( 49, 98, 18, 20 ) , ConstantGRect( 67, 98, 18, 20 ) , ConstantGRect( 83, 98, 18, 20 ) , ConstantGRect( 101, 98, 18, 20 ) , ConstantGRect( 120, 98, 18, 20 ) }
                                         , { ConstantGRect( 15, 98, 18, 20 ) , ConstantGRect( 34, 98, 18, 20 ) , ConstantGRect( 51, 98, 18, 20 ) , ConstantGRect( 67, 98, 18, 20 ) , ConstantGRect( 82, 98, 18, 20 ) , ConstantGRect( 97, 98, 18, 20 ) , ConstantGRect( 113, 98, 18, 20 ) }
                                         , { ConstantGRect( 15, 98, 18, 20 ) , ConstantGRect( 34, 98, 18, 20 ) , ConstantGRect( 51, 98, 18, 20 ) , ConstantGRect( 69, 98, 18, 20 ) , ConstantGRect( 90, 98, 18, 20 ) , ConstantGRect( 97, 98, 18, 20 ) , ConstantGRect( 121, 98, 18, 20 ) }
                                         , { ConstantGRect( 13, 98, 16, 20 ) , ConstantGRect( 29, 98, 17, 20 ) , ConstantGRect( 44, 98, 17, 20 ) , ConstantGRect( 60, 98, 18, 20 ) , ConstantGRect( 77, 98, 18, 20 ) , ConstantGRect( 93, 98, 17, 20 ) , ConstantGRect( 110, 98, 18, 20 ) }
                                         , { ConstantGRect( 16, 98, 18, 20 ) , ConstantGRect( 33, 98, 17, 20 ) , ConstantGRect( 48, 98, 17, 20 ) , ConstantGRect( 67, 98, 16, 20 ) , ConstantGRect( 83, 98, 16, 20 ) , ConstantGRect( 98, 98, 17, 20 ) , ConstantGRect( 116, 98, 18, 20 ) }
                                         };
	



// Month names
static const char *month_names_arr[][12] = { { "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec" }
                                           , { "Jan", "Feb", "Mrt", "Apr", "Mei", "Jun", "Jul", "Aug", "Sep", "Okt", "Nov", "Dec" }
                                           , { "Jan", "Feb", "Mär", "Apr", "Mai", "Jun", "Jul", "Aug", "Sep", "Okt", "Nov", "Dez" }
                                           , { "Jan", "Fév", "Mar", "Avr", "Mai", "Jun", "Jui", "Aoû", "Sep", "Oct", "Nov", "Déc" }
                                           , { "Sij", "Vel", "Ožu", "Tra", "Svi", "Lip", "Srp", "Kol", "Ruj", "Lis", "Stu", "Pro" }
                                           , { "Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic" }
                                           , { "Gen", "Feb", "Mar", "Apr", "Mag", "Giu", "Lug", "Ago", "Set", "Ott", "Nov", "Dic" }
                                           , { "Jan", "Feb", "Mar", "Apr", "Mai", "Jun", "Jul", "Aug", "Sep", "Okt", "Nov", "Des" }
                                           , { "Jan", "Feb", "Mar", "Apr", "Maj", "Jun", "Jul", "Aug", "Sep", "Okt", "Nov", "Dec" }
                                           , { "Tam", "Hel", "Maa", "Huh", "Tou", "Kes", "Hei", "Elo", "Syy", "Lok", "Mar", "Jou" }
                                           , { "Jan", "Feb", "Mar", "Apr", "Maj", "Jun", "Jul", "Aug", "Sep", "Okt", "Nov", "Dec" }
										   , { "Oca", "Şub", "Mar", "Nis", "May", "Haz", "Tem", "Ağu", "Eyl", "Eki", "Kas", "Ara" }
										   , { "Gen", "Feb", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Oct", "Nov", "Des" }
										   , { "Jan", "Feb", "Mar", "Apr", "Máj", "Jún", "Júl", "Aug", "Set", "Okt", "Nov", "Dec" }
										   , { "Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez" }
										   , { "Jan", "feb", "Már", "Ápr", "Máj", "Jún", "Júl", "Aug", "Szep","Okt", "Nov", "Dec" }
										   , { "Led", "Úno", "Bře", "Dub", "Kvě", "Čvn", "Čvc", "Srp", "Zář", "Říj", "Lis", "Pro" }
										   };


// Format week
static const char *week_formats[] = { "Week %V"
                                    , "Week %V"
                                    , "Woche %V"
                                    , "Semaine %V"
                                    , "%V. Tjedan"
                                    , "Semana %V"
                                    , "%V. Setti."
                                    , "Uke %V"
                                    , "Vecka %V"
                                    , "VKO %V"
                                    , "Uge %V"
                                    , "%V. Hafta"
                                    , "Setmana %V"
                                    , "Týžden %V"
                                    , "Semana %V"
                                    , "%V. hét"
                                    , "%V. týden"
                                    };


// Format date
static const char *date_formats[] = { "%b %e"
                                    , "%e "
                                    , "%e. "
                                    , "%e "
                                    , "%e. "
                                    , "%e "
                                    , "%e. "
                                    , "%e. "
                                    , "%e. "
                                    , "%e. "
                                    , "%e. "
                                    , "%e "
                                    , "%e "
                                    , "%e "
                                    , "%e "
                                    , "%e "
                                    , "%e "
                                    };


// Formats for second line
static const char *alt_formats[] = { "Week %V"
                                   , "%Y.%j"
                                   , "%d/%m/%y"
                                   , "%m/%d/%y"
                                   , "W%V D%j"
								   , "%Y.%m.%d"
								   , "%d.%m.%Y"
								   , "%y.%V.%d"
                                   };


static char week_text[] = "               ";
static char date_text[] = "               ";
static char alt_text[]  = "               ";


// Ordinal numbers
static const char *ordinal_numbers[] = { "st", "nd", "rd", "th", "th", "th", "th", "th", "th", "th"
                                       , "th", "th", "th", "th", "th", "th", "th", "th", "th", "th"
                                       , "st", "nd", "rd", "th", "th", "th", "th", "th", "th", "th"
                                       , "st" };