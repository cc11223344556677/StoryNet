import re
from followthemoney import model
import ollama
import difflib


# --- Configuration ---

FTM_ENTITY_TYPES = [
    "Address",
    "Airplane",
    "Article",
    "Asset",
    "Audio",
    "BankAccount",
    "Call",
    "Company",
    "Contract",
    "ContractAward",
    "CourtCase",
    "CryptoWallet",
    "Document",
    "Documentation",
    "EconomicActivity",
    "Email",
    "Event",
    "Family",
    "Folder",
    "HyperText",
    "Identification",
    "Image",
    "Loan",
    "License",
    "Message"
    "Note",
    "Organization",
    "Package",
    "Page",
    "Passport",
    "Payment",
    "Person",
    "Position",
    "Project",
    "PublicBody",
    "PlainText",
    "RealEstate",
    "Security",
    "Sanction",
    "Table",
    "TaxRoll",
    "Thing",
    "Transfer",
    "UserAccount",
    "Vehicle",
    "Vessel",
    "Video",
    "Workbook",
]

FTM_CONNECTION_TYPES = [
    "Associate",
    "Debt",
    "Directorship",
    "Employment",
    "Membership",
    "Occupancy",
    "Ownership",
    "Payment",
    "ProjectParticipant",
    "Representation",
    "Similar",
    "Succession",
]

extraction_prompt = (
    "You are an investigative journalist, and you are looking for"
    " important entities and their connections to be able to find hidden links between"
    " them in articles/documents.  The exact entity types you are looking for are from the following list:\n" \
    + ", ".join(FTM_ENTITY_TYPES) + 
    "\nYou are to format found entities as:\n"
    "[(entity1_type, entity1_name), (entity2_type, entity2_name), (entity3_type, entity3_name)]"
    "\nwhere entity names are the important object under discussion, such as \"Trump's airplane\".  "
    "You are also to "
    "  You are also to list connections between entities.  The exact connection types are:\n" \
    + ", ".join(FTM_CONNECTION_TYPES) + 
     "\nwhich are to be used as follows:\n"
    "connection_type:{entity1_name, entity3_name}"
    "\n(where if Trump owns plane 1000, it would be Ownership:{Trump, plane1000})."
    "  Do not deviate from this format, and say anything except for the list of entities and their "
    "connections, as these will be later processed using the exact brackets/colon to distinguish objects."
    "  You want to do exactly as specified for the following article:\n"
)


def parse_llm_output(output_text):
    """
    Parse the structured LLM response.
    Returns:
        entities: list[str]
        connections: list[(connection_type, source, target)]
    """
    # Extract entity list
    entity_match = re.search(r"\[(.*?)\]", output_text, re.DOTALL) # regex for getting stuff from []
    if not entity_match:
        raise ValueError("No entity list found in LLM output.")

    entity_list_raw = entity_match.group(1)
    entities = [e.strip() for e in entity_list_raw.split(",") if e.strip()]

    # Extract connections
    connections = []
    connection_pattern = r"(\w+):\{(.*?),(.*?)\}" # regex for owns:{trump, plane}

    for match in re.finditer(connection_pattern, output_text):
        connection_type = match.group(1).strip()
        source = match.group(2).strip()
        target = match.group(3).strip()
        connections.append((connection_type, source, target))

    return entities, connections


def create_entity(name):
    """
    Create a followthemoney Entity.
    Default schema is 'LegalEntity' unless otherwise specified.
    """
    schema = model.get("LegalEntity") # default

    close_matches = difflib.get_close_matches(name, FTM_ENTITY_TYPES)
    if len(close_matches > 0):
        schema_name = model.get(close_matches[0]) # get most similar connection type
        schema = model.get(schema_name)
    else:
        print(f"Warning: Unknown entity type '{name}'.")

    entity = model.make_entity(schema)
    entity.add("name", name)
    entity.make_id(name)

    return entity


def create_relationship(connection_type, source_entity, target_entity):
    """
    Create relationship entity using followthemoney schema.
    """
    close_matches = difflib.get_close_matches(connection_type, FTM_CONNECTION_TYPES)
    if len(close_matches > 0):
        schema_name = model.get(close_matches[0]) # get most similar connection type
        schema = model.get(schema_name)
    else:
        schema_name = "UnknownLink"
        schema = model.get("UnknownLink") # default
        # print(f"Warning: Unknown relationship type '{connection_type}'.")
        

    rel = model.make_entity(schema)

    # "Associate",
    # "Debt",
    # "Directorship",
    # "Employment",
    # "Membership",
    # "Occupancy",
    # "Ownership",
    # "Payment",
    # "ProjectParticipant",
    # "Representation",
    # "Similar",
    # "Succession",

    # Most relationship schemata use 'owner' / 'asset', 'person' / 'organization', etc.
    # Adjust according to your schema definitions.
    if schema_name == "Ownership":
        rel.add("owner", source_entity.id)
        rel.add("asset", target_entity.id)
    elif schema_name == "Associate":
        rel.add("person", source_entity.id)
        rel.add("associate", target_entity.id)
    elif schema_name == "Directorship":
        rel.add("director", source_entity.id)
        rel.add("organization", target_entity.id)
    elif schema_name == "Membership":
        rel.add("member", source_entity.id)
        rel.add("organization", target_entity.id)
    elif schema_name == "Debt":
        rel.add("debtor", source_entity.id)
        rel.add("creditor", target_entity.id)
    elif schema_name == "Employment":
        rel.add("employer", source_entity.id)
        rel.add("employee", target_entity.id)
    elif schema_name == "Occupancy":
        rel.add("holder", source_entity.id)
        rel.add("post", source_entity.id)
    elif schema_name == "Payment":
        rel.add("payer", source_entity.id)
        rel.add("beneficiary", target_entity.id)
    elif schema_name == "ProjectParticipant":
        rel.add("participant", source_entity.id)
        rel.add("project", target_entity.id)
    elif schema_name == "Representation":
        rel.add("agent", source_entity.id)
        rel.add("client", target_entity.id)
    elif schema_name == "Similar":
        rel.add("candidate", source_entity.id)
        rel.add("match", target_entity.id)
    elif schema_name == "Succession":
        rel.add("predecessor", source_entity.id)
        rel.add("successor", target_entity.id)
    else: # UnknownLink
        rel.add("subject", source_entity.id)
        rel.add("organization", target_entity.id)
    # TODO add support for other connection types

    return rel


def extract_entities(text):
    # TODO Replace this portion with better models/non-ollama models
    response = ollama.generate(
        model="gemma3:270m",
        prompt=(extraction_prompt + text),
    )

    llm_output = response["response"]
    # print("------------------------LLM OUTPUT------------------------")
    # print(llm_output)

    # --- Parse structured output ---
    entity_names, connections = parse_llm_output(llm_output)

    # --- Create entity objects ---
    entity_objects = {}
    for name in entity_names:
        entity_objects[name] = create_entity(name)

    # --- Create relationship entities ---
    relationship_objects = []
    for conn_type, source, target in connections:
        if source in entity_objects and target in entity_objects:
            rel = create_relationship(
                conn_type,
                entity_objects[source],
                entity_objects[target],
            )
            if rel:
                relationship_objects.append(rel)

    return list(entity_objects.values()), relationship_objects

# SAMPLE TEST CODE
# text = "Die Übergabe in Edinburgh hat nicht geklappt. Das zweite Päckchen Kaffee holt nun ein schottischer Freund aus der Collective-Gallery in der Cockburnstreet ab. \"Failed\" vermerkt Kate im Shipmentreport. \"Nett, dass wir die Packung geteilt haben, so ist wenigstens ist ein Teil angekommen\", mailt sie mir.\nKate Rich lebt in England und verkauft seit einigen Jahren Kaffee und andere Lebensmittel über soziale Netzwerke: direkt, informell und abseits der üblichen kommerziellen Kanäle. \"Feraltrade\" nennt die 43-jährige Künstlerin ihre Art, Geschäfte zu machen, \"Wilder Handel\" - ein \"öffentliches Experiment\", wie Kate sagt. Sich selbst bezeichnet sie als \"Infrastructure Artist\", als eine Künstlerin, die sich mit Netzwerken und Systemen auseinandersetzt.\nKaffee aus El Salvador, Süßigkeiten aus dem Iran und Olivenöl aus Griechenland kommen im Koffer von reisenden Künstlern, Freunden und Freunden von Freunden an den jeweiligen Bestimmungsort mit. Zurzeit hat Kate Rich Kaffee, Olivenöl, die Open-Source-Rezept-Limo \"Cube Cola\" aus Großbritannien sowie Fisch aus Montenegro auf Lager. \"Total begehrt\" seien die auf der Webseite ebenfalls erwähnten iranischen Süßigkeiten - Kate konnte allerdings zuletzt keine Lieferung auf die Beine stellen. Auch kroatischer Grappa ist zurzeit nicht zu bekommen: Die bisherige Produzentin - Mutter einer Bekannten von Kate - fand noch keine Zeit, für Nachschub zu sorgen. Was gerade bei Kate bestellt werden kann, hängt also auch davon ab, ob die Produzenten ihre Waren aktuell anbieten und ob die Produkte über das Feraltrade-System geliefert werden können. Neue Vorschläge kann jeder machen. Kate erweitert ihr Sortiment dann einfach. Einzige Bedingung: Kate will mit Waren handeln, die man nirgendwo sonst bekommt. \"Bei Feraltrade muss man in Kontakt mit anderen Menschen treten, um an das Produkt zu kommen, mit dem Kurier kommunizieren und ihn treffen\", sagt sie. Feraltrade bedeutet also auch Abenteuer und Risiko und in gewisser Weise einen Schritt zurück in die Einkaufswelt von Früher, als man die Ladenbesitzer noch kannte und nicht ständig alle Produkte verfügbar waren. Auf der Feraltrade-Webseite ist die gesamte Lieferkette mit Fotos und Einträgen dokumentiert: Wo sich die Ware gerade befindet, kann genau nachvollzogen werden. Wer etwas bestellen möchte oder ein Produkt anzubieten hat, muss Kate eine Mail schicken. Einen Online-Shop gibt es nicht - \"zu anonym\". Der \"soziale Aspekt\" sei schließlich die Hauptmotivation bei Feraltrade. Wenn alles klappt, lernt man Menschen kennen, die man sonst nicht getroffen hätte. Wenn sie gefragt wird, ob man via Feraltrade auch andere Produkte, die es etwa in britischen Supermärkten zu kaufen gibt, beziehen kann, antwortet Kate: \"Das wäre nicht Feraltrade. Bau dir dafür doch auch ein soziales Netzwerk auf!\"\nIch frage nach einer Packung Kaffee aus El Salavador an. \"Klar. Wenn du jemanden kennst, der in der nächsten Zeit von London nach Berlin reist, gib mir Bescheid\", antwortet Kate. Ich kenne niemanden. Ein paar Wochen später stehen die Urlaubsziele für das Jahr fest, geplant sind unter anderem ein paar Tage in Edinburgh. Ich schreibe Kate: \"Würde Edingburgh helfen?\" Eine Stunde später antwortet sie, das sei perfekt, sie habe soeben einen Kurier von Bristol nach Edinburgh gefunden. Kate hatte eine Rundmail geschickt: Wer in den nächsten Wochen nach Edinburgh reise, solle doch bitte so nett sein und ein Päckchen Kaffee dorthin mitnehmen. In Klammern setzt sie \"Endstation Berlin\". Daraufhin meldete sich Lea bei Kate. Ihre Freundin Iana aus Berlin käme zu Besuch, sie könnte den Kaffee gleich nach Deutschland mitnehmen. Kate fragt bei mir nach: \"Was ist dir am liebsten?\" Ich entscheide mich dafür, den Kaffee auf zwei Wegen zu erhalten.\nÜber Kate und Lea bekomme ich die E-Mail-Adresse der Filmemacherin Iana Stevanova. Sie habe nur ein paar Stunden Zeit zwischen ihrer Ankunft aus Bristol in Berlin und ihrer Weiterreise nach Wien, wo sie an einem Projekt mitarbeitet, schreibt sie. Wir verbreden uns um 13.30 Uhr am Paul-Lincke-Ufer, Ecke Mariannenstraße; wir tratschen ein wenig, ich bekomme meinen Kaffee, mache ein Foto von der Übergabe und fahre zurück ins Büro. Dort überspiele ich das Bild und stelle es auf die Feraltrade-Webseite.\nEs ist das Ende der Geschichte \"1 Coffee San Ramon to Berlin\". Den Anfang machten die US-Amerikaner Helen Cold und ihren Mann Matt Ferderbar, wie die Einträge und Fotos zeigen. Die zwei lernten die Kaffeebauern Adiloio Ceron Escobar und Blanca de Ceron in San Ramon, El Salvador, kennen. Cold und Ferderbar vermittelten den Kaffee an Kate. Auf die Feraltrade-Webseite stellten sie ein Foto der Kaffeebauern: Man sieht sie in ihrem Haus, die Großmutter schaukelt auf einer durch den einfachen Raum gespannten Hängematte. \"Hier im Haus schält die Familie die Kaffeebohnen mühsam mit einem ausgehölten Baumstumpf und einem Holzmörser\", schreiben Cold und Ferderbar.\nDie grünen, ungerösteten Bohnen reisten mit zum Flughafen von San Salvador und weiter nach Altlanta. Von dort ging es nach London - \"ausnahmsweise mit einem kommerziellen Spediteur\", schreibt Kate. Auf der Webseite steht noch, dass sie in Bristol per Western Union 719 Pfund nach San Salvador für die Kaffeebäuerin Blanca geschickt hat. Von London wurde der Kaffee zur Rösterei \"Coffee Compass\" in Littlehampton transportiert. Anschließend ging es weiter ins 150 Kilometer entfernte Bristol.\nKurz vor meiner Reise nach Schottland überweise ich Kate für beide Päckchen acht Pfund per Paypal. Ein Teil des Geldes geht an die Bauern, einen Teil behält Kate als Gewinn. Wie viel, ist aus ihrer Auflistung auf dem Päckchen zu sehen. Die Kuriere bekommen nichts. Manchmal erhielten sie als Dankeschön ein bisschen Kaffee, etwas Schokolade oder Olivenöl, sagt Kate. \"Die meisten machen das aus Interesse und Neugier.\" Was der Produzent bekommt, bestimmt dieser selbst.\nDas ist anders als bei Fairtrade, denn dort setzt die Organisation - nach Gesprächen mit dutzenden Produzenten - Mindestpreise und Zuschläge für alle fest. Der Feraltrade-Handel funktioniert nach dem Prinzip: Du nennst mir den Preis und ich entscheide, ob ich deine Ware kaufen möchte - so wie auf lokalen Märkten üblich. \"Fairtrade-Produzenten müssen dagegen beständig lächeln, ihre Produkte fröhlich herzeigen und erklären, dass sie den Lohn für die Bildung der Kinder verwenden. Aber letztlich geht es mich als Käufer doch nichts an, wofür Produzenten ihr Geld verwenden\", sagt Kate. Dass die Produzenten im Gegenzug nichts dabei mitzureden haben, wofür die Konsumenten sonst so ihr Geld ausgeben oder woher sie ihr Einkommen beziehen, sei nicht gerade \"fair\". \"Die Beziehung ist einseitig und undurchsichtig.\" Denn auch der Produzent würde in den Vordergrund gerückt im Gegensatz zum Rest der Kette: Von Agenten, Versandarbeitern, Verschiffungspersonal oder Röstern erfahre man wenig.\n\"Hi Christine, sorry, dass wir es nicht früher geschafft haben, uns bei dir zu melden. Wir haben das Feraltrade-Kaffe-Päckchen weiterhin in unserer Galerie\", schreibt Carly von der Collective-Gallery in Edinburgh. Ich bin seit einer Woche wieder in Berlin. Zwei Mal hatte ich vergeblich bei der Galerie angeklopft. Meine Mail blieb während meines Schottland-Aufenthalts unbeantwortet. Ich gebe Magnus Bescheid. \"Es duftet großartig\", mailt er mir ein paar Tage später aus Edingburgh.\nArtikel erschienen am 02. November 2012 in: \"Wiener Zeitung\", Beilage \"Wiener Journal\", S. 10-13.\n"
# print(extract_entities(text))
