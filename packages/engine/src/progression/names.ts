/**
 * Names, by nationality and by sex.
 *
 * What this replaces: one flat array of thirty first names - twenty male, ten female, untagged -
 * and twenty-four surnames, with `rng.pick` reading neither the fighter sex nor their
 * nationality. Measured on a generated roster: **231 of 661 men carried women names** and 302
 * fighters shared a full name with somebody else. Nationality was drawn from a separate list
 * entirely, so a fighter called Hiroshi Kowalski could be from Nigeria.
 *
 * A name is one of the two or three things a player ever learns about a generated fighter. Get it
 * wrong and every one of them reads as filler however carefully the attributes underneath were
 * rolled, which is why this is worth a table rather than a shuffle.
 *
 * Nationalities are weighted by how much of the sport actually comes from each, so a generated
 * roster looks like an MMA roster: heavy on the United States and Brazil, deep through the former
 * Soviet states, with real representation from the countries that run their own promotions. The
 * pools are not exhaustive and are not meant to be - they are a plausible cross-section, and the
 * combinatorics do the rest.
 */

import type { Rng } from '../core/rng.js';
import type { Sex } from '../domain/divisions.js';

export interface NamePool {
  nationality: string;
  /** Relative likelihood a generated fighter comes from here. */
  weight: number;
  male: readonly string[];
  female: readonly string[];
  surnames: readonly string[];
}

export const NAME_POOLS: readonly NamePool[] = [
  {
    nationality: 'USA',
    weight: 200,
    male: [
      'Anthony', 'Brandon', 'Caleb', 'Darnell', 'Devin', 'Dominick', 'Elijah', 'Gabriel',
      'Hunter', 'Isaiah', 'Jalen', 'Jared', 'Jaxon', 'Jordan', 'Justin', 'Kevin', 'Logan',
      'Malik', 'Marcus', 'Mason', 'Nathan', 'Quentin', 'Ryan', 'Sean', 'Trevor', 'Tyler',
      'Wyatt', 'Zachary', 'Cody', 'Derrick', 'Grant', 'Preston',
    ],
    female: [
      'Alyssa', 'Ashley', 'Brianna', 'Cassidy', 'Danielle', 'Erica', 'Hailey', 'Jasmine',
      'Jenna', 'Kayla', 'Kendra', 'Lauren', 'Macy', 'Megan', 'Nicole', 'Paige', 'Rachel',
      'Savannah', 'Sierra', 'Taylor', 'Tori', 'Whitney',
    ],
    surnames: [
      'Adams', 'Bennett', 'Brooks', 'Carter', 'Coleman', 'Dawson', 'Ellis', 'Foster',
      'Griffin', 'Hayes', 'Hendricks', 'Jackson', 'Kessler', 'Lawson', 'Mitchell',
      'Nolan', 'Parker', 'Preston', 'Reed', 'Sawyer', 'Shelton', 'Sullivan', 'Thornton',
      'Vance', 'Walker', 'Whitaker', 'Barnes', 'Crawford', 'Fletcher', 'Hollis',
    ],
  },
  {
    nationality: 'Brazil',
    weight: 150,
    male: [
      'Alexandre', 'Anderson', 'Bruno', 'Caio', 'Carlos', 'Cleber', 'Diego', 'Douglas',
      'Eduardo', 'Fabricio', 'Gilberto', 'Gustavo', 'Jose', 'Leandro', 'Lucas', 'Marlon',
      'Mateus', 'Murilo', 'Paulo', 'Rafael', 'Renan', 'Ricardo', 'Rodrigo', 'Thiago',
      'Vinicius', 'Wanderlei', 'Yuri', 'Everton', 'Juliano', 'Matheus',
    ],
    female: [
      'Amanda', 'Ariane', 'Beatriz', 'Bruna', 'Camila', 'Carolina', 'Fernanda', 'Gabriela',
      'Jessica', 'Juliana', 'Larissa', 'Leticia', 'Luana', 'Mariana', 'Patricia', 'Priscila',
      'Renata', 'Talita', 'Vanessa', 'Viviane',
    ],
    surnames: [
      'Almeida', 'Alves', 'Barbosa', 'Cardoso', 'Carvalho', 'Correia', 'Costa', 'Dias',
      'Ferreira', 'Fonseca', 'Gomes', 'Lima', 'Machado', 'Martins', 'Melo', 'Mendes',
      'Moraes', 'Nascimento', 'Nogueira', 'Oliveira', 'Pereira', 'Pinto', 'Ramos',
      'Ribeiro', 'Rocha', 'Santos', 'Silva', 'Souza', 'Teixeira', 'Vieira',
    ],
  },
  {
    nationality: 'Russia',
    weight: 120,
    male: [
      'Aleksandr', 'Anatoly', 'Andrei', 'Anton', 'Artem', 'Boris', 'Denis', 'Dmitri',
      'Egor', 'Evgeny', 'Fedor', 'Gleb', 'Igor', 'Ilya', 'Ivan', 'Kirill', 'Konstantin',
      'Leonid', 'Maxim', 'Mikhail', 'Nikita', 'Oleg', 'Pavel', 'Roman', 'Ruslan', 'Sergei',
      'Stanislav', 'Timur', 'Vadim', 'Valery', 'Viktor', 'Vladimir', 'Yuri',
    ],
    female: [
      'Alina', 'Anastasia', 'Anna', 'Darya', 'Ekaterina', 'Elena', 'Galina', 'Irina',
      'Kseniya', 'Larisa', 'Marina', 'Nadezhda', 'Natalia', 'Olga', 'Polina', 'Svetlana',
      'Tatiana', 'Valeria', 'Vera', 'Yulia',
    ],
    surnames: [
      'Abdulaev', 'Antonov', 'Baranov', 'Bogdanov', 'Fedorov', 'Gusev', 'Ivanov', 'Karpov',
      'Kozlov', 'Kuznetsov', 'Lebedev', 'Makarov', 'Morozov', 'Nikitin', 'Novikov',
      'Orlov', 'Pavlov', 'Petrov', 'Popov', 'Romanov', 'Sidorov', 'Smirnov', 'Sokolov',
      'Solovyov', 'Stepanov', 'Vasiliev', 'Volkov', 'Yakovlev', 'Zaitsev', 'Zhukov',
    ],
  },
  {
    nationality: 'England',
    weight: 90,
    male: [
      'Alfie', 'Archie', 'Callum', 'Charlie', 'Connor', 'Dean', 'Declan', 'Elliot',
      'Finley', 'George', 'Harrison', 'Jack', 'Jamie', 'Joseph', 'Kieran', 'Leon',
      'Liam', 'Lewis', 'Marcus', 'Nathan', 'Oliver', 'Reece', 'Ryan', 'Samuel', 'Scott',
      'Thomas', 'Tyler', 'Alex', 'Dominic', 'Harvey',
    ],
    female: [
      'Amber', 'Beth', 'Chloe', 'Ellie', 'Emily', 'Georgia', 'Grace', 'Hannah', 'Holly',
      'Imogen', 'Jodie', 'Katie', 'Lucy', 'Megan', 'Molly', 'Olivia', 'Paige', 'Rebecca',
      'Sophie', 'Zoe',
    ],
    surnames: [
      'Adams', 'Ashcroft', 'Barker', 'Bennett', 'Blackwood', 'Bradley', 'Carter', 'Chapman',
      'Clarke', 'Cooper', 'Dawson', 'Ellis', 'Fletcher', 'Gibson', 'Hargreaves', 'Harrison',
      'Hayward', 'Holloway', 'Jenkins', 'Kemp', 'Marsh', 'Mercer', 'Newton', 'Pearce',
      'Radcliffe', 'Sanderson', 'Sutton', 'Thornton', 'Wallace', 'Whitmore',
    ],
  },
  {
    nationality: 'Mexico',
    weight: 70,
    male: [
      'Alejandro', 'Angel', 'Arturo', 'Cesar', 'Cristian', 'Diego', 'Eduardo', 'Emiliano',
      'Enrique', 'Fernando', 'Francisco', 'Gerardo', 'Hector', 'Ignacio', 'Javier',
      'Jesus', 'Joaquin', 'Jorge', 'Jose', 'Juan', 'Luis', 'Manuel', 'Marco', 'Miguel',
      'Octavio', 'Pedro', 'Rafael', 'Ramiro', 'Ricardo', 'Salvador', 'Sergio',
    ],
    female: [
      'Adriana', 'Alejandra', 'Ana', 'Carmen', 'Cecilia', 'Daniela', 'Diana', 'Elena',
      'Fernanda', 'Gabriela', 'Guadalupe', 'Isabel', 'Karla', 'Lucia', 'Mariana', 'Monica',
      'Paola', 'Rosario', 'Valeria', 'Ximena',
    ],
    surnames: [
      'Aguilar', 'Alvarez', 'Bautista', 'Cabrera', 'Castillo', 'Cervantes', 'Chavez',
      'Delgado', 'Dominguez', 'Escobar', 'Espinoza', 'Flores', 'Fuentes', 'Gallardo',
      'Garcia', 'Guzman', 'Herrera', 'Jimenez', 'Juarez', 'Lozano', 'Marquez', 'Medina',
      'Mendoza', 'Montoya', 'Nunez', 'Ochoa', 'Ramirez', 'Reyes', 'Rivera', 'Salazar',
      'Vargas', 'Zamora',
    ],
  },
  {
    nationality: 'Japan',
    weight: 80,
    male: [
      'Akira', 'Daichi', 'Daiki', 'Haruto', 'Hayato', 'Hideo', 'Hiroki', 'Hiroshi',
      'Itsuki', 'Junya', 'Kaito', 'Katsuya', 'Kazuki', 'Keisuke', 'Kenta', 'Kohei',
      'Koji', 'Makoto', 'Masato', 'Naoki', 'Ren', 'Riku', 'Ryo', 'Ryota', 'Satoshi',
      'Shinya', 'Sho', 'Sota', 'Takashi', 'Takeshi', 'Tatsuya', 'Tomoya', 'Yuji', 'Yuta',
    ],
    female: [
      'Aiko', 'Akane', 'Ayaka', 'Chihiro', 'Emi', 'Haruka', 'Hikari', 'Kaori', 'Mai',
      'Mika', 'Miku', 'Misaki', 'Nana', 'Naomi', 'Rei', 'Rina', 'Saki', 'Sakura', 'Yui',
      'Yuki',
    ],
    surnames: [
      'Abe', 'Aoki', 'Endo', 'Fujimoto', 'Fujita', 'Goto', 'Hasegawa', 'Hashimoto',
      'Hayashi', 'Inoue', 'Ishida', 'Ito', 'Kato', 'Kimura', 'Kobayashi', 'Kondo',
      'Maeda', 'Matsumoto', 'Mori', 'Murakami', 'Nakamura', 'Ogawa', 'Okada', 'Saito',
      'Sakamoto', 'Sasaki', 'Sato', 'Shimizu', 'Suzuki', 'Takahashi', 'Tanaka', 'Watanabe',
      'Yamada', 'Yamamoto', 'Yoshida',
    ],
  },
  {
    nationality: 'Poland',
    weight: 60,
    male: [
      'Adrian', 'Arkadiusz', 'Bartosz', 'Damian', 'Dawid', 'Filip', 'Grzegorz', 'Jakub',
      'Jan', 'Jaroslaw', 'Kamil', 'Karol', 'Krzysztof', 'Lukasz', 'Maciej', 'Marcin',
      'Marek', 'Mateusz', 'Michal', 'Pawel', 'Piotr', 'Przemyslaw', 'Rafal', 'Robert',
      'Sebastian', 'Szymon', 'Tomasz', 'Wojciech', 'Zbigniew', 'Dariusz',
    ],
    female: [
      'Agnieszka', 'Aleksandra', 'Anna', 'Barbara', 'Dorota', 'Ewa', 'Iwona', 'Joanna',
      'Julia', 'Karolina', 'Katarzyna', 'Magdalena', 'Malgorzata', 'Marta', 'Monika',
      'Natalia', 'Paulina', 'Sylwia', 'Weronika', 'Zofia',
    ],
    surnames: [
      'Adamczyk', 'Baran', 'Bak', 'Blaszczyk', 'Chmielewski', 'Dabrowski', 'Duda',
      'Glowacki', 'Gorski', 'Jankowski', 'Kaczmarek', 'Kaminski', 'Kowalczyk', 'Kowalski',
      'Krawczyk', 'Lewandowski', 'Majewski', 'Michalak', 'Nowak', 'Olszewski', 'Pawlak',
      'Piotrowski', 'Sikora', 'Szymanski', 'Walczak', 'Wieczorek', 'Wojcik', 'Wozniak',
      'Zajac', 'Zielinski',
    ],
  },
  {
    nationality: 'Nigeria',
    weight: 45,
    male: [
      'Abiodun', 'Adebayo', 'Adewale', 'Chidi', 'Chinedu', 'Chukwuemeka', 'Ebuka',
      'Efe', 'Emeka', 'Femi', 'Ifeanyi', 'Ikechukwu', 'Kelechi', 'Kingsley', 'Nnamdi',
      'Obinna', 'Olamide', 'Oluwaseun', 'Segun', 'Tobenna', 'Tunde', 'Uche', 'Uzoma',
      'Yemi', 'Chibuzo', 'Ayodeji',
    ],
    female: [
      'Adaeze', 'Amaka', 'Blessing', 'Chiamaka', 'Chidinma', 'Chioma', 'Ifeoma', 'Ngozi',
      'Nkechi', 'Oluwaseyi', 'Onyinye', 'Temitope', 'Yewande', 'Zainab', 'Adanna',
      'Folake',
    ],
    surnames: [
      'Abara', 'Achebe', 'Adebayo', 'Adeyemi', 'Afolabi', 'Balogun', 'Chukwu', 'Eze',
      'Ibrahim', 'Ibeh', 'Iheanacho', 'Iwu', 'Kalu', 'Madu', 'Nnadi', 'Nwachukwu',
      'Nwosu', 'Obi', 'Obiora', 'Odili', 'Ogunleye', 'Okafor', 'Okeke', 'Okonkwo',
      'Okoro', 'Olawale', 'Oluwole', 'Onyekwere', 'Uche', 'Udoh',
    ],
  },
  {
    nationality: 'Australia',
    weight: 45,
    male: [
      'Beau', 'Blake', 'Braden', 'Brodie', 'Callan', 'Cooper', 'Darcy', 'Declan', 'Ethan',
      'Flynn', 'Hayden', 'Jarrah', 'Jesse', 'Kai', 'Lachlan', 'Liam', 'Mitchell', 'Nathan',
      'Riley', 'Rory', 'Ryan', 'Shane', 'Tanner', 'Toby', 'Travis', 'Tyson', 'Wade',
      'Zane', 'Angus', 'Bailey',
    ],
    female: [
      'Alyssa', 'Bridget', 'Chloe', 'Ebony', 'Georgia', 'Hayley', 'Indiana', 'Jasmine',
      'Kirra', 'Lara', 'Maddison', 'Matilda', 'Piper', 'Rhiannon', 'Sienna', 'Skye',
      'Summer', 'Tayla', 'Willow', 'Zara',
    ],
    surnames: [
      'Anderson', 'Armstrong', 'Bailey', 'Barrett', 'Bishop', 'Bradshaw', 'Buckley',
      'Cameron', 'Chandler', 'Donnelly', 'Dunne', 'Fitzgerald', 'Gallagher', 'Hayes',
      'Hennessy', 'Hobbs', 'Kavanagh', 'Kingsley', 'Lachlan', 'Mackay', 'Mahoney',
      'Malone', 'Mercer', 'Murdoch', 'Nash', 'Prescott', 'Quinlan', 'Rafferty', 'Sheppard',
      'Sutcliffe',
    ],
  },
  {
    nationality: 'France',
    weight: 45,
    male: [
      'Adrien', 'Alexandre', 'Antoine', 'Baptiste', 'Benjamin', 'Cedric', 'Clement',
      'Damien', 'Dorian', 'Enzo', 'Fabien', 'Florian', 'Gaetan', 'Guillaume', 'Hugo',
      'Julien', 'Kevin', 'Loic', 'Lucas', 'Mathieu', 'Maxime', 'Nicolas', 'Olivier',
      'Quentin', 'Romain', 'Sebastien', 'Theo', 'Thibault', 'Valentin', 'Vincent',
      'Yanis',
    ],
    female: [
      'Amelie', 'Aurelie', 'Camille', 'Celine', 'Chloe', 'Clara', 'Elodie', 'Emma',
      'Fanny', 'Ines', 'Jade', 'Julie', 'Laura', 'Lea', 'Manon', 'Marion', 'Nathalie',
      'Oceane', 'Pauline', 'Sarah',
    ],
    surnames: [
      'Barbier', 'Bernard', 'Blanchard', 'Bonnet', 'Boucher', 'Chevalier', 'Colin',
      'Dubois', 'Duval', 'Fabre', 'Fontaine', 'Fournier', 'Garnier', 'Gauthier', 'Girard',
      'Guerin', 'Henry', 'Lambert', 'Laurent', 'Lefebvre', 'Legrand', 'Lemaire', 'Leroy',
      'Marchand', 'Martin', 'Mercier', 'Moreau', 'Morel', 'Muller', 'Perrin', 'Renaud',
      'Rousseau', 'Roux', 'Vidal',
    ],
  },
  {
    nationality: 'Georgia',
    weight: 35,
    male: [
      'Aleksandre', 'Archil', 'Avtandil', 'Beka', 'Davit', 'George', 'Giorgi', 'Guram',
      'Ilia', 'Irakli', 'Koba', 'Lasha', 'Levan', 'Luka', 'Merab', 'Mikheil', 'Nika',
      'Nodar', 'Otar', 'Rezo', 'Sandro', 'Shota', 'Tornike', 'Vakhtang', 'Zurab', 'Giga',
      'Saba',
    ],
    female: [
      'Ana', 'Eka', 'Elene', 'Ketevan', 'Khatia', 'Lali', 'Mariam', 'Nana', 'Natia',
      'Nino', 'Salome', 'Tamar', 'Tamuna', 'Teona', 'Tinatin',
    ],
    surnames: [
      'Abashidze', 'Amiranashvili', 'Beridze', 'Chikhladze', 'Dolidze', 'Gabunia',
      'Gelashvili', 'Gogoladze', 'Iashvili', 'Janashvili', 'Kapanadze', 'Kharadze',
      'Khutsishvili', 'Kiknadze', 'Lomidze', 'Maisuradze', 'Mchedlishvili', 'Melikidze',
      'Nadiradze', 'Okriashvili', 'Papidze', 'Rustaveli', 'Shengelia', 'Tsiklauri',
      'Tsulaia', 'Zaridze',
    ],
  },
  {
    nationality: 'South Korea',
    weight: 35,
    male: [
      'Byungchul', 'Chanwoo', 'Dohyun', 'Donghyun', 'Hoyeon', 'Hyunwoo', 'Jaehyun',
      'Jihoon', 'Jinwoo', 'Jiwon', 'Joonho', 'Junyoung', 'Kwangsoo', 'Kyungho', 'Minjae',
      'Minsu', 'Sanghyun', 'Seokjin', 'Seunghyun', 'Sungmin', 'Taeyang', 'Wonjin',
      'Yeonjun', 'Youngho', 'Jaewon', 'Hyungjun',
    ],
    female: [
      'Bomi', 'Chaewon', 'Dahye', 'Eunji', 'Haeun', 'Hyejin', 'Jieun', 'Jiwoo', 'Minji',
      'Nayeon', 'Seoyeon', 'Soojin', 'Sohee', 'Yerim', 'Yoonseo', 'Yuna',
    ],
    surnames: [
      'Ahn', 'Bae', 'Baek', 'Cha', 'Chang', 'Cho', 'Choi', 'Chung', 'Han', 'Hong',
      'Hwang', 'Im', 'Jang', 'Jeon', 'Jeong', 'Jin', 'Jung', 'Kang', 'Kim', 'Ko', 'Kwon',
      'Lee', 'Lim', 'Moon', 'Nam', 'Oh', 'Park', 'Ryu', 'Seo', 'Shin', 'Son', 'Song',
      'Yang', 'Yoo', 'Yoon',
    ],
  },
  {
    nationality: 'Sweden',
    weight: 30,
    male: [
      'Albin', 'Alexander', 'Anton', 'Axel', 'Elias', 'Emil', 'Erik', 'Filip', 'Fredrik',
      'Gustav', 'Hampus', 'Henrik', 'Isak', 'Johan', 'Jonas', 'Kalle', 'Linus', 'Ludvig',
      'Magnus', 'Marcus', 'Mattias', 'Niklas', 'Oskar', 'Patrik', 'Rasmus', 'Simon',
      'Sebastian', 'Tobias', 'Viktor', 'William',
    ],
    female: [
      'Agnes', 'Alva', 'Astrid', 'Ebba', 'Elin', 'Ellen', 'Emma', 'Freja', 'Hanna',
      'Ida', 'Ingrid', 'Julia', 'Klara', 'Linnea', 'Maja', 'Moa', 'Saga', 'Sofia',
      'Tilda', 'Wilma',
    ],
    surnames: [
      'Andersson', 'Bengtsson', 'Berg', 'Bergstrom', 'Bjork', 'Carlsson', 'Dahl', 'Eklund',
      'Ekstrom', 'Engstrom', 'Eriksson', 'Falk', 'Forsberg', 'Gustafsson', 'Hallberg',
      'Hedlund', 'Holm', 'Jonsson', 'Karlsson', 'Larsson', 'Lindberg', 'Lindqvist',
      'Lundgren', 'Magnusson', 'Nilsson', 'Nordin', 'Olsson', 'Persson', 'Sandberg',
      'Sjoberg', 'Strom', 'Svensson', 'Wallin',
    ],
  },
  {
    nationality: 'Canada',
    weight: 35,
    male: [
      'Aiden', 'Blake', 'Brayden', 'Cameron', 'Chase', 'Cole', 'Connor', 'Dawson',
      'Dylan', 'Ethan', 'Gavin', 'Hayden', 'Hunter', 'Jaxon', 'Jesse', 'Keegan', 'Landon',
      'Levi', 'Liam', 'Logan', 'Mason', 'Nolan', 'Owen', 'Parker', 'Reid', 'Riley',
      'Ryder', 'Spencer', 'Tanner', 'Tristan',
    ],
    female: [
      'Abigail', 'Alexis', 'Avery', 'Brooke', 'Chloe', 'Ella', 'Emily', 'Hannah', 'Jade',
      'Jordyn', 'Kaitlyn', 'Lauren', 'Madison', 'Mackenzie', 'Maya', 'Nicole', 'Olivia',
      'Paige', 'Sydney', 'Taylor',
    ],
    surnames: [
      'Beaulieu', 'Bergeron', 'Bouchard', 'Boucher', 'Caron', 'Cloutier', 'Cote', 'Desjardins',
      'Fortin', 'Gagnon', 'Gauthier', 'Girard', 'Hebert', 'Lachance', 'Lafleur', 'Lambert',
      'Landry', 'Lavoie', 'Leblanc', 'Lefebvre', 'Levesque', 'Martel', 'Mercier', 'Morin',
      'Nadeau', 'Ouellet', 'Paquette', 'Pelletier', 'Poirier', 'Roy', 'Simard', 'Thibault',
      'Tremblay', 'Vachon',
    ],
  },
  {
    nationality: 'Kazakhstan',
    weight: 30,
    male: [
      'Adil', 'Aibek', 'Aidos', 'Alibek', 'Almas', 'Arman', 'Askar', 'Azamat', 'Bakhtiyar',
      'Batyr', 'Bekzat', 'Damir', 'Daniyar', 'Dias', 'Erlan', 'Kanat', 'Kuanysh', 'Marat',
      'Miras', 'Nurlan', 'Olzhas', 'Rustem', 'Sanzhar', 'Serik', 'Talgat', 'Temirlan',
      'Yerbol', 'Yerlan', 'Zhandos', 'Zhanibek',
    ],
    female: [
      'Aigerim', 'Ainur', 'Aizhan', 'Akbota', 'Alua', 'Aruzhan', 'Assel', 'Bayan',
      'Dana', 'Dinara', 'Gulnara', 'Kamila', 'Madina', 'Nazgul', 'Saltanat', 'Zarina',
    ],
    surnames: [
      'Abdrakhmanov', 'Akhmetov', 'Alimzhanov', 'Amangeldiev', 'Baimuratov', 'Bekturov',
      'Dosanov', 'Ergaliev', 'Ibragimov', 'Iskakov', 'Kabylov', 'Kaliyev', 'Karimov',
      'Kenzhebaev', 'Mukhamedov', 'Nurgaliev', 'Omarov', 'Rakhimov', 'Sadykov', 'Serikbayev',
      'Suleimenov', 'Tashkenov', 'Toleubayev', 'Turgunov', 'Yerzhanov', 'Zhaksylykov',
      'Zhumabekov',
    ],
  },
  {
    nationality: 'Ireland',
    weight: 30,
    male: [
      'Aidan', 'Brendan', 'Cathal', 'Ciaran', 'Colm', 'Conor', 'Cormac', 'Darragh',
      'Declan', 'Diarmuid', 'Eoin', 'Fergal', 'Finbar', 'Gearoid', 'Kieran', 'Liam',
      'Lorcan', 'Niall', 'Oisin', 'Padraig', 'Ronan', 'Ruairi', 'Seamus', 'Sean', 'Shane',
      'Tadhg', 'Turlough', 'Eamon', 'Fintan',
    ],
    female: [
      'Aine', 'Aisling', 'Aoife', 'Bridget', 'Caoimhe', 'Ciara', 'Clodagh', 'Eimear',
      'Fiona', 'Grainne', 'Maeve', 'Niamh', 'Orla', 'Roisin', 'Saoirse', 'Siobhan',
      'Sinead', 'Ailbhe',
    ],
    surnames: [
      'Boyle', 'Brennan', 'Byrne', 'Cahill', 'Callaghan', 'Carroll', 'Casey', 'Clancy',
      'Coyle', 'Cullen', 'Daly', 'Donnelly', 'Doyle', 'Duffy', 'Dunne', 'Fitzgerald',
      'Flanagan', 'Gallagher', 'Hogan', 'Kavanagh', 'Keane', 'Kelly', 'Kennedy', 'Lynch',
      'Maguire', 'Mahony', 'Malone', 'McCarthy', 'Murphy', 'Nolan', 'Quinn', 'Rafferty',
      'Reilly', 'Ryan', 'Sheridan', 'Walsh',
    ],
  },
  {
    nationality: 'Netherlands',
    weight: 28,
    male: [
      'Bas', 'Bram', 'Daan', 'Dennis', 'Dirk', 'Erik', 'Floris', 'Gerard', 'Hendrik',
      'Jelle', 'Jeroen', 'Joost', 'Kees', 'Lars', 'Lucas', 'Maarten', 'Marco', 'Mark',
      'Mees', 'Niels', 'Pieter', 'Rens', 'Rick', 'Robin', 'Ruben', 'Sander', 'Sem',
      'Sven', 'Thijs', 'Tim', 'Willem', 'Wouter',
    ],
    female: [
      'Anouk', 'Bo', 'Britt', 'Demi', 'Eva', 'Fleur', 'Iris', 'Jasmijn', 'Julia', 'Lieke',
      'Lotte', 'Maud', 'Merel', 'Nienke', 'Noa', 'Roos', 'Sanne', 'Sofie', 'Tess',
      'Yara',
    ],
    surnames: [
      'Bakker', 'Bos', 'Bosman', 'Brouwer', 'Dekker', 'Dijkstra', 'Groot', 'Hendriks',
      'Hoekstra', 'Jansen', 'Janssen', 'Klein', 'Kok', 'Koning', 'Kuiper', 'Meijer',
      'Mulder', 'Peters', 'Post', 'Prins', 'Schouten', 'Smit', 'Timmermans', 'Vermeulen',
      'Visser', 'Vos', 'Willems', 'Wolters', 'Zijlstra',
    ],
  },
  {
    nationality: 'China',
    weight: 35,
    male: [
      'Bo', 'Chao', 'Cheng', 'Dawei', 'Feng', 'Gang', 'Hao', 'Jianguo', 'Jie', 'Jun',
      'Kai', 'Lei', 'Liang', 'Ming', 'Peng', 'Qiang', 'Rui', 'Sheng', 'Tao', 'Wei',
      'Xiang', 'Xin', 'Yang', 'Yong', 'Yu', 'Zhen', 'Zhi', 'Zhong', 'Bin',
    ],
    female: [
      'Fang', 'Hong', 'Hui', 'Jia', 'Jing', 'Juan', 'Lan', 'Li', 'Lian', 'Ling', 'Mei',
      'Min', 'Na', 'Ping', 'Qing', 'Rong', 'Xia', 'Xiu', 'Yan', 'Ying',
    ],
    surnames: [
      'Cai', 'Cao', 'Chen', 'Deng', 'Ding', 'Feng', 'Gao', 'Guo', 'Han', 'He', 'Hu',
      'Huang', 'Jiang', 'Li', 'Lin', 'Liu', 'Luo', 'Ma', 'Pan', 'Peng', 'Qian', 'Song',
      'Sun', 'Tang', 'Wang', 'Wu', 'Xie', 'Xu', 'Yang', 'Ye', 'Yu', 'Zeng', 'Zhang',
      'Zhao', 'Zheng', 'Zhou', 'Zhu',
    ],
  },
  {
    nationality: 'Ukraine',
    weight: 28,
    male: [
      'Andriy', 'Bohdan', 'Danylo', 'Denys', 'Dmytro', 'Ihor', 'Ivan', 'Kostiantyn',
      'Mykhailo', 'Mykola', 'Nazar', 'Oleh', 'Oleksandr', 'Oleksiy', 'Ostap', 'Pavlo',
      'Petro', 'Roman', 'Ruslan', 'Serhiy', 'Stanislav', 'Taras', 'Vadym', 'Valentyn',
      'Vasyl', 'Viktor', 'Vitaliy', 'Volodymyr', 'Yaroslav', 'Yuriy',
    ],
    female: [
      'Alina', 'Anastasiia', 'Bohdana', 'Daryna', 'Iryna', 'Kateryna', 'Khrystyna',
      'Liliya', 'Maryna', 'Nataliya', 'Oksana', 'Olena', 'Solomiya', 'Sofiya', 'Tetiana',
      'Valeriya', 'Viktoriya', 'Yuliya',
    ],
    surnames: [
      'Bondarenko', 'Boyko', 'Danylchenko', 'Fedorenko', 'Havrylenko', 'Hrytsenko',
      'Kharchenko', 'Klymenko', 'Kovalchuk', 'Kovalenko', 'Kravchenko', 'Lysenko',
      'Marchenko', 'Melnyk', 'Moroz', 'Onyshchenko', 'Petrenko', 'Polishchuk', 'Rudenko',
      'Savchenko', 'Shevchenko', 'Sydorenko', 'Tkachenko', 'Tymoshenko', 'Vasylenko',
      'Yatsenko', 'Zakharchenko',
    ],
  },
  {
    nationality: 'Czechia',
    weight: 24,
    male: [
      'Adam', 'Ales', 'David', 'Filip', 'Jakub', 'Jan', 'Jaroslav', 'Jiri', 'Josef',
      'Karel', 'Lukas', 'Marek', 'Martin', 'Michal', 'Milan', 'Ondrej', 'Patrik', 'Pavel',
      'Petr', 'Radek', 'Roman', 'Stanislav', 'Tomas', 'Vaclav', 'Vit', 'Vladimir',
      'Vojtech', 'Zdenek',
    ],
    female: [
      'Adela', 'Alena', 'Barbora', 'Eliska', 'Hana', 'Ivana', 'Jana', 'Karolina', 'Katerina',
      'Klara', 'Kristyna', 'Lenka', 'Lucie', 'Marketa', 'Martina', 'Michaela', 'Petra',
      'Tereza', 'Veronika', 'Zuzana',
    ],
    surnames: [
      'Benes', 'Blazek', 'Cerny', 'Dolezal', 'Dvorak', 'Fiala', 'Hajek', 'Havel', 'Horak',
      'Hruby', 'Jelinek', 'Kolar', 'Kratochvil', 'Krejci', 'Kucera', 'Marek', 'Masek',
      'Nemec', 'Novak', 'Novotny', 'Pokorny', 'Pospisil', 'Prochazka', 'Ruzicka', 'Sedlacek',
      'Simek', 'Sykora', 'Urban', 'Vanek', 'Vesely', 'Zeman',
    ],
  },
  {
    nationality: 'Thailand',
    weight: 22,
    male: [
      'Anan', 'Anuwat', 'Chaiyaphum', 'Chatchai', 'Kiatisak', 'Krit', 'Narong', 'Nattapong',
      'Niran', 'Panya', 'Phichit', 'Pornchai', 'Prasert', 'Rungroj', 'Sakda', 'Samran',
      'Sarawut', 'Somchai', 'Somsak', 'Suchart', 'Sukhum', 'Sompong', 'Thanawat', 'Wichai',
      'Worawut', 'Yuttana',
    ],
    female: [
      'Achara', 'Anong', 'Kanya', 'Lawan', 'Malee', 'Mali', 'Nari', 'Nittaya', 'Pensri',
      'Ploy', 'Ratana', 'Siriporn', 'Somsri', 'Sudarat', 'Thida', 'Wanida',
    ],
    surnames: [
      'Boonmee', 'Charoen', 'Intharat', 'Jaidee', 'Kaewkla', 'Khunthong', 'Kittisak',
      'Nakarin', 'Nopparat', 'Phimchai', 'Phumipat', 'Prasert', 'Rattanakosin', 'Saetang',
      'Sangthong', 'Silapan', 'Sombat', 'Srisai', 'Suwannarat', 'Tangjai', 'Thepnakhon',
      'Wongsawat', 'Yindee',
    ],
  },
  {
    nationality: 'Kyrgyzstan',
    weight: 18,
    male: [
      'Aibek', 'Almaz', 'Azamat', 'Baktybek', 'Bekzat', 'Chyngyz', 'Daniyar', 'Emil',
      'Erlan', 'Ilim', 'Kanat', 'Kubanychbek', 'Maksat', 'Marat', 'Mirbek', 'Nurbek',
      'Nursultan', 'Ruslan', 'Sanjar', 'Taalai', 'Talant', 'Tilek', 'Ulan', 'Zamir',
    ],
    female: [
      'Aichurek', 'Aidai', 'Ainura', 'Aizada', 'Altynai', 'Begimai', 'Cholpon', 'Elmira',
      'Gulnara', 'Jyldyz', 'Meerim', 'Nurgul', 'Saltanat', 'Zarina',
    ],
    surnames: [
      'Abdyldaev', 'Akmatov', 'Asanov', 'Bakirov', 'Beishenaliev', 'Duishenbek', 'Ismailov',
      'Jusupov', 'Kalykov', 'Karimov', 'Kasymov', 'Maratov', 'Nurlanov', 'Omurbekov',
      'Sadyrbekov', 'Sultanov', 'Tashiev', 'Toktogulov', 'Turdubekov', 'Usenov',
    ],
  },
  {
    nationality: 'Argentina',
    weight: 22,
    male: [
      'Agustin', 'Alejandro', 'Bruno', 'Cristian', 'Damian', 'Diego', 'Emiliano', 'Facundo',
      'Federico', 'Franco', 'Gaston', 'Gonzalo', 'Guillermo', 'Hernan', 'Ignacio',
      'Joaquin', 'Julian', 'Leandro', 'Lucas', 'Marcelo', 'Martin', 'Mateo', 'Matias',
      'Nicolas', 'Pablo', 'Ramiro', 'Rodrigo', 'Santiago', 'Sebastian', 'Tomas',
    ],
    female: [
      'Agustina', 'Camila', 'Candela', 'Carolina', 'Delfina', 'Florencia', 'Guadalupe',
      'Julieta', 'Lucia', 'Malena', 'Micaela', 'Milagros', 'Paula', 'Rocio', 'Sofia',
      'Valentina', 'Victoria', 'Ximena',
    ],
    surnames: [
      'Acosta', 'Aguirre', 'Alvarez', 'Benitez', 'Bianchi', 'Cabrera', 'Cardozo', 'Castro',
      'Dominguez', 'Duarte', 'Fernandez', 'Ferrari', 'Gimenez', 'Gonzalez', 'Gutierrez',
      'Ibarra', 'Juarez', 'Ledesma', 'Luna', 'Medina', 'Molina', 'Moreno', 'Ortiz',
      'Paredes', 'Peralta', 'Quiroga', 'Rios', 'Rojas', 'Romero', 'Sosa', 'Suarez',
      'Vega', 'Villalba',
    ],
  },
  {
    nationality: 'Cuba',
    weight: 16,
    male: [
      'Alejandro', 'Alexis', 'Ariel', 'Carlos', 'Dayron', 'Elier', 'Frank', 'Guillermo',
      'Humberto', 'Ivan', 'Javier', 'Jorge', 'Julio', 'Leonardo', 'Lazaro', 'Manuel',
      'Michel', 'Orlando', 'Osmany', 'Pedro', 'Rafael', 'Ramon', 'Reinier', 'Roberto',
      'Rolando', 'Yoel', 'Yordan', 'Yunior',
    ],
    female: [
      'Aliuska', 'Anisleidys', 'Damaris', 'Dayana', 'Idalmis', 'Leidys', 'Maribel',
      'Milaidys', 'Odalys', 'Yaima', 'Yamila', 'Yanet', 'Yudith', 'Yusleidy',
    ],
    surnames: [
      'Aguilera', 'Alonso', 'Baez', 'Blanco', 'Cabrera', 'Camacho', 'Cardenas', 'Castillo',
      'Cespedes', 'Delgado', 'Duarte', 'Estrada', 'Fuentes', 'Guerra', 'Herrera', 'Izquierdo',
      'Lastre', 'Machado', 'Mesa', 'Montano', 'Naranjo', 'Ordonez', 'Perez', 'Quesada',
      'Rivero', 'Rodriguez', 'Sarmiento', 'Tamayo', 'Valdes', 'Zamora',
    ],
  },
];

const TOTAL_WEIGHT = NAME_POOLS.reduce((sum, pool) => sum + pool.weight, 0);

/** Pick a nationality, weighted by how much of the sport comes from there. */
export function pickNationality(rng: Rng): NamePool {
  let roll = rng.range(0, TOTAL_WEIGHT);
  for (const pool of NAME_POOLS) {
    roll -= pool.weight;
    if (roll <= 0) return pool;
  }
  return NAME_POOLS[NAME_POOLS.length - 1]!;
}

export const poolFor = (nationality: string): NamePool | undefined =>
  NAME_POOLS.find((p) => p.nationality === nationality);

/**
 * A name that matches the fighter it is attached to.
 *
 * Takes the sex, because the old generator did not, and takes an optional nationality so a caller
 * that has already decided where somebody is from - the 2026 seed fills regional promotions from
 * their own countries - gets a name that agrees with it rather than one drawn at random.
 */
export function generateName(
  rng: Rng,
  sex: Sex,
  nationality?: string,
): { firstName: string; lastName: string; nationality: string } {
  const pool = (nationality ? poolFor(nationality) : undefined) ?? pickNationality(rng);
  const given = sex === 'female' ? pool.female : pool.male;

  return {
    firstName: rng.pick(given),
    lastName: rng.pick(pool.surnames),
    // The requested nationality wins even when there is no pool for it, so a caller can seed a
    // country this table does not cover without the fighter being silently relocated.
    nationality: nationality ?? pool.nationality,
  };
}
