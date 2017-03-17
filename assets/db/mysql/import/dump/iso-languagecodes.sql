USE %s;

LOAD DATA LOCAL INFILE '%s'
INTO TABLE iso_languagecodes
CHARACTER SET 'UTF8MB4'
IGNORE 1 LINES
(iso_639_3, iso_639_2, iso_639_1, language_name);
