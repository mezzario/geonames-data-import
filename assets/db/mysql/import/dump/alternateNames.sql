USE %s;

LOAD DATA LOCAL INFILE '%s'
INTO TABLE alternatename
CHARACTER SET 'UTF8MB4'
(alternatenameid, geonameid, isoLanguage, alternateName, isPreferredName, isShortName, isColloquial, isHistoric);
