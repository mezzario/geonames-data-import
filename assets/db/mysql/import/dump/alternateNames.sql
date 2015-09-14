USE %s;

LOAD DATA LOCAL INFILE '%s'
INTO TABLE alternatename
CHARACTER SET 'UTF8'
(alternatenameid, geonameid, isoLanguage, alternateName, isPreferredName, isShortName, isColloquial, isHistoric);
