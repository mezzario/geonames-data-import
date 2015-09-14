USE %s;

LOAD DATA LOCAL INFILE '%s'
INTO TABLE geoname
CHARACTER SET 'UTF8'
(geonameid, name, asciiname, alternatenames, latitude, longitude, fclass, fcode, country, cc2, admin1, admin2, admin3, admin4, population, elevation, gtopo30, timezone, moddate);
