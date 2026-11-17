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

/**
 * How a surname changes for a woman, in the languages where it does.
 *
 * Russian, Polish and Czech surnames are gendered: a woman in the Volkov family is a Volkova, a
 * Kowalski is a Kowalska, a Novak is a Novakova. The table stores the masculine form once and this
 * derives the other, because a female fighter called "Anastasia Volkov" reads as a mistake to
 * anybody who has watched the sport — and the old table did exactly that to every woman from these
 * countries.
 */
export type SurnameForm = 'russian' | 'ukrainian' | 'polish' | 'czech';

export interface NamePool {
  nationality: string;
  /** How a woman's surname differs from the stored masculine one. Absent: it does not. */
  surnameForm?: SurnameForm;
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
      'Anthony', 'Brandon', 'Caleb', 'Darnell', 'Devin', 'Dominick', 'Elijah', 'Gabriel', 'Hunter',
      'Isaiah', 'Jalen', 'Jared', 'Jaxon', 'Jordan', 'Justin', 'Kevin', 'Logan', 'Malik', 'Marcus',
      'Mason', 'Nathan', 'Quentin', 'Ryan', 'Sean', 'Trevor', 'Tyler', 'Wyatt', 'Zachary', 'Cody',
      'Derrick', 'Grant', 'Preston', 'Aaron', 'Adrian', 'Alex', 'Andre', 'Andrew', 'Austin',
      'Brett', 'Bryce', 'Cameron', 'Chad', 'Chase', 'Christian', 'Clay', 'Cole', 'Colton', 'Connor',
      'Corey', 'Curtis', 'Dakota', 'Dalton', 'Damon', 'Dante', 'DeAndre', 'Demetrius', 'Desmond',
      'Dustin', 'Dwayne', 'Eli', 'Eric', 'Ethan', 'Garrett', 'Isaac', 'Jake', 'Jamal', 'Jason',
      'Javier', 'Jeremy', 'Jerome', 'Jesse', 'Josh', 'Kenny', 'Kyle', 'Lamar', 'Landon', 'Levi',
      'Luis', 'Maurice', 'Miles', 'Owen', 'Reggie', 'Rico', 'Roman', 'Shane', 'Spencer', 'Terrance',
      'Travis', 'Trey', 'Tristan', 'Victor', 'Wesley', 'Xavier', 'Zane', 'Gage', 'Andres', 'Damian',
      'Terrell',
    ],
    female: [
      'Alyssa', 'Ashley', 'Brianna', 'Cassidy', 'Danielle', 'Erica', 'Hailey', 'Jasmine', 'Jenna',
      'Kayla', 'Kendra', 'Lauren', 'Macy', 'Megan', 'Nicole', 'Paige', 'Rachel', 'Savannah',
      'Sierra', 'Taylor', 'Tori', 'Whitney', 'Abby', 'Alexis', 'Amber', 'Andrea', 'Bailey',
      'Brittany', 'Chelsea', 'Courtney', 'Destiny', 'Gabrielle', 'Jade', 'Jordyn', 'Kelsey',
      'Kristen', 'Leah', 'Mackenzie', 'Mariah', 'Miranda', 'Morgan', 'Raven', 'Shelby', 'Tiana',
      'Brooke', 'Kiara', 'Monique', 'Aaliyah', 'Kimberly',
    ],
    surnames: [
      'Adams', 'Bennett', 'Brooks', 'Carter', 'Coleman', 'Dawson', 'Ellis', 'Foster', 'Griffin',
      'Hayes', 'Hendricks', 'Jackson', 'Kessler', 'Lawson', 'Mitchell', 'Nolan', 'Parker',
      'Preston', 'Reed', 'Sawyer', 'Shelton', 'Sullivan', 'Thornton', 'Vance', 'Walker', 'Whitaker',
      'Barnes', 'Crawford', 'Fletcher', 'Hollis', 'Allen', 'Anderson', 'Atkins', 'Bailey', 'Baker',
      'Bell', 'Bishop', 'Booker', 'Bowman', 'Boyd', 'Bradley', 'Brady', 'Burke', 'Caldwell',
      'Campbell', 'Chambers', 'Chandler', 'Clayton', 'Cobb', 'Collins', 'Cooper', 'Cunningham',
      'Davis', 'Dixon', 'Douglas', 'Duncan', 'Edwards', 'Fields', 'Fisher', 'Gaines', 'Garrett',
      'Gibson', 'Graham', 'Graves', 'Hall', 'Hampton', 'Harper', 'Harrison', 'Hawkins', 'Holt',
      'Hopkins', 'Howard', 'Hudson', 'Hunt', 'Jefferson', 'Jenkins', 'Jennings', 'Keller', 'Knight',
      'Lambert', 'Lowe', 'Maddox', 'Malone', 'Manning', 'McCoy', 'Meyer', 'Monroe', 'Morgan',
      'Mosley', 'Murray', 'Nash', 'Norris', 'Owens', 'Patterson', 'Payne', 'Porter', 'Pratt',
      'Pruitt', 'Quinn', 'Ramsey', 'Reynolds', 'Rhodes', 'Riley', 'Robinson', 'Russell', 'Sanders',
      'Shaw', 'Simmons', 'Stanton', 'Steele', 'Stokes', 'Tate', 'Tucker', 'Turner', 'Wade',
      'Wallace', 'Warren', 'Washington', 'Webb', 'Wheeler', 'Wilkins', 'Wright', 'Young',
    ],
  },
  {
    nationality: 'Brazil',
    weight: 150,
    male: [
      'Alexandre', 'Anderson', 'Bruno', 'Caio', 'Carlos', 'Cleber', 'Diego', 'Douglas', 'Eduardo',
      'Fabricio', 'Gilberto', 'Gustavo', 'Jose', 'Leandro', 'Lucas', 'Marlon', 'Mateus', 'Murilo',
      'Paulo', 'Rafael', 'Renan', 'Ricardo', 'Rodrigo', 'Thiago', 'Vinicius', 'Wanderlei', 'Yuri',
      'Everton', 'Juliano', 'Matheus', 'Adriano', 'Alan', 'Andre', 'Antonio', 'Arthur', 'Bernardo',
      'Breno', 'Cristiano', 'Daniel', 'Davi', 'Edson', 'Elias', 'Fabio', 'Felipe', 'Fernando',
      'Francisco', 'Gabriel', 'Gilson', 'Heitor', 'Henrique', 'Igor', 'Jairo', 'Joao', 'Jonas',
      'Kaique', 'Leonardo', 'Luiz', 'Marcelo', 'Marcio', 'Mauricio', 'Michel', 'Otavio', 'Pedro',
      'Raul', 'Robson', 'Rogerio', 'Sandro', 'Sergio', 'Tiago', 'Wellington', 'Wesley',
    ],
    female: [
      'Amanda', 'Ariane', 'Beatriz', 'Bruna', 'Camila', 'Carolina', 'Fernanda', 'Gabriela',
      'Jessica', 'Juliana', 'Larissa', 'Leticia', 'Luana', 'Mariana', 'Patricia', 'Priscila',
      'Renata', 'Talita', 'Vanessa', 'Viviane', 'Aline', 'Ana', 'Barbara', 'Bianca', 'Cristiane',
      'Daniela', 'Debora', 'Eduarda', 'Elaine', 'Flavia', 'Isabela', 'Jaqueline', 'Karina', 'Livia',
      'Marina', 'Monica', 'Natalia', 'Paula', 'Rafaela', 'Sabrina', 'Simone', 'Tais', 'Thaina',
      'Yasmin',
    ],
    surnames: [
      'Almeida', 'Alves', 'Barbosa', 'Cardoso', 'Carvalho', 'Correia', 'Costa', 'Dias', 'Ferreira',
      'Fonseca', 'Gomes', 'Lima', 'Machado', 'Martins', 'Melo', 'Mendes', 'Moraes', 'Nascimento',
      'Nogueira', 'Oliveira', 'Pereira', 'Pinto', 'Ramos', 'Ribeiro', 'Rocha', 'Santos', 'Silva',
      'Souza', 'Teixeira', 'Vieira', 'Andrade', 'Araujo', 'Azevedo', 'Batista', 'Bezerra', 'Borges',
      'Braga', 'Brito', 'Campos', 'Castro', 'Cavalcanti', 'Coelho', 'Cunha', 'Duarte', 'Farias',
      'Freitas', 'Gaspar', 'Guimaraes', 'Lacerda', 'Leite', 'Lopes', 'Macedo', 'Marques', 'Matos',
      'Medeiros', 'Monteiro', 'Moreira', 'Moura', 'Nunes', 'Pacheco', 'Paiva', 'Peixoto', 'Prado',
      'Queiroz', 'Reis', 'Rezende', 'Sampaio', 'Siqueira', 'Tavares', 'Toledo', 'Vasconcelos',
      'Viana', 'Xavier',
    ],
  },
  {
    nationality: 'Russia',
    surnameForm: 'russian',
    weight: 120,
    male: [
      'Aleksandr', 'Anatoly', 'Andrei', 'Anton', 'Artem', 'Boris', 'Denis', 'Dmitri', 'Egor',
      'Evgeny', 'Fedor', 'Gleb', 'Igor', 'Ilya', 'Ivan', 'Kirill', 'Konstantin', 'Leonid', 'Maxim',
      'Mikhail', 'Nikita', 'Oleg', 'Pavel', 'Roman', 'Ruslan', 'Sergei', 'Stanislav', 'Timur',
      'Vadim', 'Valery', 'Viktor', 'Vladimir', 'Yuri', 'Arkady', 'Daniil', 'Fyodor', 'Gennady',
      'Grigory', 'Lev', 'Matvei', 'Nikolai', 'Semyon', 'Valentin', 'Vladislav', 'Yaroslav',
      'Zakhar', 'Magomed', 'Abubakar', 'Islam', 'Shamil', 'Rasul', 'Murad', 'Zaur', 'Akhmed',
      'Ramazan', 'Said', 'Gadzhi', 'Umar', 'Aslan', 'Arslan',
    ],
    female: [
      'Alina', 'Anastasia', 'Anna', 'Darya', 'Ekaterina', 'Elena', 'Galina', 'Irina', 'Kseniya',
      'Larisa', 'Marina', 'Nadezhda', 'Natalia', 'Olga', 'Polina', 'Svetlana', 'Tatiana', 'Valeria',
      'Vera', 'Yulia', 'Alena', 'Daria', 'Ksenia', 'Lyudmila', 'Margarita', 'Natalya', 'Varvara',
      'Zarina', 'Madina', 'Aminat',
    ],
    surnames: [
      'Abdulaev', 'Antonov', 'Baranov', 'Bogdanov', 'Fedorov', 'Gusev', 'Ivanov', 'Karpov',
      'Kozlov', 'Kuznetsov', 'Lebedev', 'Makarov', 'Morozov', 'Nikitin', 'Novikov', 'Orlov',
      'Pavlov', 'Petrov', 'Popov', 'Romanov', 'Sidorov', 'Smirnov', 'Sokolov', 'Solovyov',
      'Stepanov', 'Vasiliev', 'Volkov', 'Yakovlev', 'Zaitsev', 'Zhukov', 'Alekseev', 'Belov',
      'Belyaev', 'Bykov', 'Chernov', 'Davydov', 'Egorov', 'Filippov', 'Frolov', 'Gavrilov',
      'Golubev', 'Gromov', 'Isaev', 'Kiselev', 'Komarov', 'Korolev', 'Kovalev', 'Krylov', 'Kulikov',
      'Lazarev', 'Medvedev', 'Melnikov', 'Mironov', 'Nazarov', 'Osipov', 'Polyakov', 'Rybakov',
      'Semenov', 'Sergeev', 'Shcherbakov', 'Tarasov', 'Tikhonov', 'Titov', 'Vinogradov', 'Vorobyov',
      'Zakharov', 'Zuev', 'Gadzhiev', 'Magomedov', 'Aliev', 'Omarov', 'Khasanov', 'Ibragimov',
      'Saidov', 'Kurbanov', 'Yusupov', 'Akhmedov', 'Umarov',
    ],
  },
  {
    nationality: 'England',
    weight: 90,
    male: [
      'Alfie', 'Archie', 'Callum', 'Charlie', 'Connor', 'Dean', 'Declan', 'Elliot', 'Finley',
      'George', 'Harrison', 'Jack', 'Jamie', 'Joseph', 'Kieran', 'Leon', 'Liam', 'Lewis', 'Marcus',
      'Nathan', 'Oliver', 'Reece', 'Ryan', 'Samuel', 'Scott', 'Thomas', 'Tyler', 'Alex', 'Dominic',
      'Harvey', 'Ben', 'Billy', 'Danny', 'Freddie', 'Harry', 'Joe', 'Josh', 'Louis', 'Max', 'Ollie',
      'Ricky', 'Robbie', 'Sam', 'Stuart', 'Theo', 'Toby', 'Tom', 'Wayne',
    ],
    female: [
      'Amber', 'Beth', 'Chloe', 'Ellie', 'Emily', 'Georgia', 'Grace', 'Hannah', 'Holly', 'Imogen',
      'Jodie', 'Katie', 'Lucy', 'Megan', 'Molly', 'Olivia', 'Paige', 'Rebecca', 'Sophie', 'Zoe',
      'Abigail', 'Amelia', 'Bethany', 'Charlotte', 'Isla', 'Jade', 'Leanne', 'Phoebe', 'Poppy',
      'Stacey', 'Kirsty', 'Gemma',
    ],
    surnames: [
      'Adams', 'Ashcroft', 'Barker', 'Bennett', 'Blackwood', 'Bradley', 'Carter', 'Chapman',
      'Clarke', 'Cooper', 'Dawson', 'Ellis', 'Fletcher', 'Gibson', 'Hargreaves', 'Harrison',
      'Hayward', 'Holloway', 'Jenkins', 'Kemp', 'Marsh', 'Mercer', 'Newton', 'Pearce', 'Radcliffe',
      'Sanderson', 'Sutton', 'Thornton', 'Wallace', 'Whitmore', 'Ashworth', 'Atherton', 'Bailey',
      'Bradshaw', 'Briggs', 'Brown', 'Buckley', 'Butler', 'Cole', 'Cox', 'Davies', 'Dixon', 'Evans',
      'Fox', 'Green', 'Hall', 'Harris', 'Haworth', 'Hill', 'Holmes', 'Hughes', 'Jones', 'Knowles',
      'Lowe', 'Moore', 'Morris', 'Palmer', 'Pickering', 'Price', 'Pritchard', 'Richardson',
      'Robinson', 'Shaw', 'Stevens', 'Stone', 'Sutcliffe', 'Taylor', 'Thompson', 'Ward', 'Webb',
      'Wood', 'Wright', 'Yates',
    ],
  },
  {
    nationality: 'Mexico',
    weight: 70,
    male: [
      'Alejandro', 'Angel', 'Arturo', 'Cesar', 'Cristian', 'Diego', 'Eduardo', 'Emiliano',
      'Enrique', 'Fernando', 'Francisco', 'Gerardo', 'Hector', 'Ignacio', 'Javier', 'Jesus',
      'Joaquin', 'Jorge', 'Jose', 'Juan', 'Luis', 'Manuel', 'Marco', 'Miguel', 'Octavio', 'Pedro',
      'Rafael', 'Ramiro', 'Ricardo', 'Salvador', 'Sergio', 'Adrian', 'Alberto', 'Alfredo', 'Andres',
      'Armando', 'Daniel', 'Emilio', 'Erick', 'Ernesto', 'Guillermo', 'Hugo', 'Ivan', 'Jaime',
      'Julio', 'Leonardo', 'Mario', 'Mauricio', 'Oscar', 'Pablo', 'Ramon', 'Raul', 'Rogelio',
      'Santiago', 'Ulises', 'Victor',
    ],
    female: [
      'Adriana', 'Alejandra', 'Ana', 'Carmen', 'Cecilia', 'Daniela', 'Diana', 'Elena', 'Fernanda',
      'Gabriela', 'Guadalupe', 'Isabel', 'Karla', 'Lucia', 'Mariana', 'Monica', 'Paola', 'Rosario',
      'Valeria', 'Ximena', 'Andrea', 'Brenda', 'Claudia', 'Esmeralda', 'Itzel', 'Lorena', 'Marisol',
      'Rocio', 'Yesenia',
    ],
    surnames: [
      'Aguilar', 'Alvarez', 'Bautista', 'Cabrera', 'Castillo', 'Cervantes', 'Chavez', 'Delgado',
      'Dominguez', 'Escobar', 'Espinoza', 'Flores', 'Fuentes', 'Gallardo', 'Garcia', 'Guzman',
      'Herrera', 'Jimenez', 'Juarez', 'Lozano', 'Marquez', 'Medina', 'Mendoza', 'Montoya', 'Nunez',
      'Ochoa', 'Ramirez', 'Reyes', 'Rivera', 'Salazar', 'Vargas', 'Zamora', 'Alvarado', 'Avila',
      'Beltran', 'Calderon', 'Camacho', 'Contreras', 'Cortes', 'Estrada', 'Garza', 'Guerrero',
      'Ibarra', 'Lara', 'Luna', 'Maldonado', 'Mejia', 'Molina', 'Navarro', 'Orozco', 'Pacheco',
      'Padilla', 'Pena', 'Quintero', 'Rios', 'Robles', 'Rosales', 'Sandoval', 'Solis', 'Trejo',
      'Valdez', 'Velazquez', 'Zavala',
    ],
  },
  {
    nationality: 'Japan',
    weight: 80,
    male: [
      'Akira', 'Daichi', 'Daiki', 'Haruto', 'Hayato', 'Hideo', 'Hiroki', 'Hiroshi', 'Itsuki',
      'Junya', 'Kaito', 'Katsuya', 'Kazuki', 'Keisuke', 'Kenta', 'Kohei', 'Koji', 'Makoto',
      'Masato', 'Naoki', 'Ren', 'Riku', 'Ryo', 'Ryota', 'Satoshi', 'Shinya', 'Sho', 'Sota',
      'Takashi', 'Takeshi', 'Tatsuya', 'Tomoya', 'Yuji', 'Yuta', 'Atsushi', 'Daisuke', 'Hideki',
      'Hikaru', 'Isamu', 'Jun', 'Kenji', 'Kota', 'Osamu', 'Shinji', 'Shota', 'Sora', 'Takumi',
      'Taro', 'Tomohiro', 'Tsubasa', 'Yamato', 'Yoshiki', 'Yusuke', 'Yuto',
    ],
    female: [
      'Aiko', 'Akane', 'Ayaka', 'Chihiro', 'Emi', 'Haruka', 'Hikari', 'Kaori', 'Mai', 'Mika',
      'Miku', 'Misaki', 'Nana', 'Naomi', 'Rei', 'Rina', 'Saki', 'Sakura', 'Yui', 'Yuki', 'Asuka',
      'Hina', 'Kana', 'Mao', 'Megumi', 'Nanami', 'Sayaka', 'Yuka', 'Momoka',
    ],
    surnames: [
      'Abe', 'Aoki', 'Endo', 'Fujimoto', 'Fujita', 'Goto', 'Hasegawa', 'Hashimoto', 'Hayashi',
      'Inoue', 'Ishida', 'Ito', 'Kato', 'Kimura', 'Kobayashi', 'Kondo', 'Maeda', 'Matsumoto',
      'Mori', 'Murakami', 'Nakamura', 'Ogawa', 'Okada', 'Saito', 'Sakamoto', 'Sasaki', 'Sato',
      'Shimizu', 'Suzuki', 'Takahashi', 'Tanaka', 'Watanabe', 'Yamada', 'Yamamoto', 'Yoshida',
      'Fujii', 'Fukuda', 'Hirano', 'Ikeda', 'Ishii', 'Ishikawa', 'Kaneko', 'Kikuchi', 'Kudo',
      'Matsuda', 'Miura', 'Nagai', 'Nakajima', 'Nishimura', 'Ono', 'Sugimoto', 'Tamura',
      'Yamaguchi',
    ],
  },
  {
    nationality: 'Poland',
    surnameForm: 'polish',
    weight: 60,
    male: [
      'Adrian', 'Arkadiusz', 'Bartosz', 'Damian', 'Dawid', 'Filip', 'Grzegorz', 'Jakub', 'Jan',
      'Jaroslaw', 'Kamil', 'Karol', 'Krzysztof', 'Lukasz', 'Maciej', 'Marcin', 'Marek', 'Mateusz',
      'Michal', 'Pawel', 'Piotr', 'Przemyslaw', 'Rafal', 'Robert', 'Sebastian', 'Szymon', 'Tomasz',
      'Wojciech', 'Zbigniew', 'Dariusz', 'Hubert', 'Kacper', 'Konrad', 'Krystian', 'Mariusz',
      'Patryk', 'Radoslaw',
    ],
    female: [
      'Agnieszka', 'Aleksandra', 'Anna', 'Barbara', 'Dorota', 'Ewa', 'Iwona', 'Joanna', 'Julia',
      'Karolina', 'Katarzyna', 'Magdalena', 'Malgorzata', 'Marta', 'Monika', 'Natalia', 'Paulina',
      'Sylwia', 'Weronika', 'Zofia', 'Agata', 'Dominika', 'Izabela', 'Justyna', 'Zuzanna',
    ],
    surnames: [
      'Adamczyk', 'Baran', 'Bak', 'Blaszczyk', 'Chmielewski', 'Dabrowski', 'Duda', 'Glowacki',
      'Gorski', 'Jankowski', 'Kaczmarek', 'Kaminski', 'Kowalczyk', 'Kowalski', 'Krawczyk',
      'Lewandowski', 'Majewski', 'Michalak', 'Nowak', 'Olszewski', 'Pawlak', 'Piotrowski', 'Sikora',
      'Szymanski', 'Walczak', 'Wieczorek', 'Wojcik', 'Wozniak', 'Zajac', 'Zielinski', 'Borkowski',
      'Brzezinski', 'Czarnecki', 'Gajewski', 'Grabowski', 'Jakubowski', 'Jasinski', 'Kalinowski',
      'Kozlowski', 'Krol', 'Kubiak', 'Kucharski', 'Lis', 'Malinowski', 'Mazur', 'Michalski',
      'Nowicki', 'Ostrowski', 'Pietrzak', 'Sadowski', 'Sobczak', 'Sokolowski', 'Stepien',
      'Szczepanski', 'Tomaszewski', 'Wilk', 'Wojciechowski', 'Wrobel', 'Wysocki', 'Zalewski',
    ],
  },
  {
    nationality: 'Nigeria',
    weight: 45,
    male: [
      'Abiodun', 'Adebayo', 'Adewale', 'Chidi', 'Chinedu', 'Chukwuemeka', 'Ebuka', 'Efe', 'Emeka',
      'Femi', 'Ifeanyi', 'Ikechukwu', 'Kelechi', 'Kingsley', 'Nnamdi', 'Obinna', 'Olamide',
      'Oluwaseun', 'Segun', 'Tobenna', 'Tunde', 'Uche', 'Uzoma', 'Yemi', 'Chibuzo', 'Ayodeji',
      'Ayodele', 'Babatunde', 'Damilare', 'Ekene', 'Folarin', 'Gbenga', 'Ibrahim', 'Kayode', 'Musa',
      'Olumide', 'Sola', 'Tobi', 'Yakubu', 'Yusuf',
    ],
    female: [
      'Adaeze', 'Amaka', 'Blessing', 'Chiamaka', 'Chidinma', 'Chioma', 'Ifeoma', 'Ngozi', 'Nkechi',
      'Oluwaseyi', 'Onyinye', 'Temitope', 'Yewande', 'Zainab', 'Adanna', 'Folake', 'Adaora',
      'Bisola', 'Ebele', 'Funmilayo', 'Kemi', 'Simisola', 'Titilayo', 'Yetunde',
    ],
    surnames: [
      'Abara', 'Achebe', 'Adebayo', 'Adeyemi', 'Afolabi', 'Balogun', 'Chukwu', 'Eze', 'Ibrahim',
      'Ibeh', 'Iheanacho', 'Iwu', 'Kalu', 'Madu', 'Nnadi', 'Nwachukwu', 'Nwosu', 'Obi', 'Obiora',
      'Odili', 'Ogunleye', 'Okafor', 'Okeke', 'Okonkwo', 'Okoro', 'Olawale', 'Oluwole', 'Onyekwere',
      'Uche', 'Udoh', 'Abubakar', 'Adeleke', 'Ajayi', 'Akinola', 'Alabi', 'Babalola', 'Bello',
      'Danjuma', 'Ibekwe', 'Igwe', 'Mohammed', 'Nwankwo', 'Oladipo', 'Onyeka', 'Sani', 'Uzor',
    ],
  },
  {
    nationality: 'Australia',
    weight: 45,
    male: [
      'Beau', 'Blake', 'Braden', 'Brodie', 'Callan', 'Cooper', 'Darcy', 'Declan', 'Ethan', 'Flynn',
      'Hayden', 'Jarrah', 'Jesse', 'Kai', 'Lachlan', 'Liam', 'Mitchell', 'Nathan', 'Riley', 'Rory',
      'Ryan', 'Shane', 'Tanner', 'Toby', 'Travis', 'Tyson', 'Wade', 'Zane', 'Angus', 'Bailey',
      'Aidan', 'Brock', 'Corey', 'Dylan', 'Hamish', 'Jarrod', 'Jayden', 'Kane', 'Rhys', 'Zac',
    ],
    female: [
      'Alyssa', 'Bridget', 'Chloe', 'Ebony', 'Georgia', 'Hayley', 'Indiana', 'Jasmine', 'Kirra',
      'Lara', 'Maddison', 'Matilda', 'Piper', 'Rhiannon', 'Sienna', 'Skye', 'Summer', 'Tayla',
      'Willow', 'Zara', 'Abbey', 'Bree', 'Brooke', 'Chelsea', 'Ella', 'Jess', 'Madison', 'Mia',
      'Rebecca', 'Sarah', 'Shannon', 'Tahlia', 'Tegan', 'Zoe',
    ],
    surnames: [
      'Anderson', 'Armstrong', 'Bailey', 'Barrett', 'Bishop', 'Bradshaw', 'Buckley', 'Cameron',
      'Chandler', 'Donnelly', 'Dunne', 'Fitzgerald', 'Gallagher', 'Hayes', 'Hennessy', 'Hobbs',
      'Kavanagh', 'Kingsley', 'Lachlan', 'Mackay', 'Mahoney', 'Malone', 'Mercer', 'Murdoch', 'Nash',
      'Prescott', 'Quinlan', 'Rafferty', 'Sheppard', 'Sutcliffe', 'Bell', 'Bourke', 'Burgess',
      'Campbell', 'Collins', 'Cooper', 'Doyle', 'Edwards', 'Fraser', 'Hammond', 'Harding',
      'Henderson', 'Hogan', 'Kennedy', 'Kerr', 'McDonald', 'McKenzie', 'Morrison', 'Murphy',
      'Nguyen', 'Nicholson', 'Pearce', 'Ross', 'Sinclair', 'Stewart', 'Tran', 'Walsh', 'Watson',
      'Wilson',
    ],
  },
  {
    nationality: 'France',
    weight: 45,
    male: [
      'Adrien', 'Alexandre', 'Antoine', 'Baptiste', 'Benjamin', 'Cedric', 'Clement', 'Damien',
      'Dorian', 'Enzo', 'Fabien', 'Florian', 'Gaetan', 'Guillaume', 'Hugo', 'Julien', 'Kevin',
      'Loic', 'Lucas', 'Mathieu', 'Maxime', 'Nicolas', 'Olivier', 'Quentin', 'Romain', 'Sebastien',
      'Theo', 'Thibault', 'Valentin', 'Vincent', 'Yanis', 'Alexis', 'Arnaud', 'Bastien', 'Benoit',
      'Gael', 'Jeremy', 'Karim', 'Mehdi', 'Moussa', 'Sofiane', 'Youssef',
    ],
    female: [
      'Amelie', 'Aurelie', 'Camille', 'Celine', 'Chloe', 'Clara', 'Elodie', 'Emma', 'Fanny', 'Ines',
      'Jade', 'Julie', 'Laura', 'Lea', 'Manon', 'Marion', 'Nathalie', 'Oceane', 'Pauline', 'Sarah',
      'Amandine', 'Emilie', 'Nadia', 'Sonia', 'Yasmine',
    ],
    surnames: [
      'Barbier', 'Bernard', 'Blanchard', 'Bonnet', 'Boucher', 'Chevalier', 'Colin', 'Dubois',
      'Duval', 'Fabre', 'Fontaine', 'Fournier', 'Garnier', 'Gauthier', 'Girard', 'Guerin', 'Henry',
      'Lambert', 'Laurent', 'Lefebvre', 'Legrand', 'Lemaire', 'Leroy', 'Marchand', 'Martin',
      'Mercier', 'Moreau', 'Morel', 'Muller', 'Perrin', 'Renaud', 'Rousseau', 'Roux', 'Vidal',
      'Andre', 'Benali', 'Bertrand', 'Blanc', 'Boyer', 'Brun', 'David', 'Diallo', 'Durand', 'Faure',
      'Haddad', 'Masson', 'Michel', 'Petit', 'Richard', 'Robert', 'Simon', 'Traore', 'Vincent',
    ],
  },
  {
    nationality: 'Georgia',
    weight: 35,
    male: [
      'Aleksandre', 'Archil', 'Avtandil', 'Beka', 'Davit', 'George', 'Giorgi', 'Guram', 'Ilia',
      'Irakli', 'Koba', 'Lasha', 'Levan', 'Luka', 'Merab', 'Mikheil', 'Nika', 'Nodar', 'Otar',
      'Rezo', 'Sandro', 'Shota', 'Tornike', 'Vakhtang', 'Zurab', 'Giga', 'Saba', 'Akaki', 'Bachana',
      'Dato', 'Gela', 'Goga', 'Kakha', 'Mamuka', 'Revaz', 'Tamaz', 'Temur', 'Zviad',
    ],
    female: [
      'Ana', 'Eka', 'Elene', 'Ketevan', 'Khatia', 'Lali', 'Mariam', 'Nana', 'Natia', 'Nino',
      'Salome', 'Tamar', 'Tamuna', 'Teona', 'Tinatin', 'Lela', 'Sopho', 'Tamta',
    ],
    surnames: [
      'Abashidze', 'Amiranashvili', 'Beridze', 'Chikhladze', 'Dolidze', 'Gabunia', 'Gelashvili',
      'Gogoladze', 'Iashvili', 'Janashvili', 'Kapanadze', 'Kharadze', 'Khutsishvili', 'Kiknadze',
      'Lomidze', 'Maisuradze', 'Mchedlishvili', 'Melikidze', 'Nadiradze', 'Okriashvili', 'Papidze',
      'Rustaveli', 'Shengelia', 'Tsiklauri', 'Tsulaia', 'Zaridze', 'Bakradze', 'Chkheidze',
      'Giorgadze', 'Gogichaishvili', 'Javakhishvili', 'Jikia', 'Kharaishvili', 'Mchedlidze',
      'Natsvlishvili', 'Nozadze', 'Papava', 'Tsiskaridze', 'Zhvania',
    ],
  },
  {
    nationality: 'South Korea',
    weight: 35,
    male: [
      'Byungchul', 'Chanwoo', 'Dohyun', 'Donghyun', 'Hoyeon', 'Hyunwoo', 'Jaehyun', 'Jihoon',
      'Jinwoo', 'Jiwon', 'Joonho', 'Junyoung', 'Kwangsoo', 'Kyungho', 'Minjae', 'Minsu', 'Sanghyun',
      'Seokjin', 'Seunghyun', 'Sungmin', 'Taeyang', 'Wonjin', 'Yeonjun', 'Youngho', 'Jaewon',
      'Hyungjun', 'Byungho', 'Changmin', 'Daehyun', 'Dongwook', 'Hojin', 'Junseo', 'Kyungmin',
      'Minho', 'Minjun', 'Sangwoo', 'Seojun', 'Seungmin', 'Sunghoon', 'Wonjun', 'Youngjae', 'Yunho',
    ],
    female: [
      'Bomi', 'Chaewon', 'Dahye', 'Eunji', 'Haeun', 'Hyejin', 'Jieun', 'Jiwoo', 'Minji', 'Nayeon',
      'Seoyeon', 'Soojin', 'Sohee', 'Yerim', 'Yoonseo', 'Yuna', 'Areum', 'Chaeyoung', 'Gayoung',
      'Yeji', 'Jiyeon',
    ],
    surnames: [
      'Ahn', 'Bae', 'Baek', 'Cha', 'Chang', 'Cho', 'Choi', 'Chung', 'Han', 'Hong', 'Hwang', 'Im',
      'Jang', 'Jeon', 'Jeong', 'Jin', 'Jung', 'Kang', 'Kim', 'Ko', 'Kwon', 'Lee', 'Lim', 'Moon',
      'Nam', 'Oh', 'Park', 'Ryu', 'Seo', 'Shin', 'Son', 'Song', 'Yang', 'Yoo', 'Yoon', 'Byun',
      'Chae', 'Gong', 'Heo', 'Jo', 'Ju', 'Na', 'Woo',
    ],
  },
  {
    nationality: 'Sweden',
    weight: 30,
    male: [
      'Albin', 'Alexander', 'Anton', 'Axel', 'Elias', 'Emil', 'Erik', 'Filip', 'Fredrik', 'Gustav',
      'Hampus', 'Henrik', 'Isak', 'Johan', 'Jonas', 'Kalle', 'Linus', 'Ludvig', 'Magnus', 'Marcus',
      'Mattias', 'Niklas', 'Oskar', 'Patrik', 'Rasmus', 'Simon', 'Sebastian', 'Tobias', 'Viktor',
      'William', 'Casper', 'Jesper', 'Joakim', 'Oscar', 'Pontus', 'Wilhelm',
    ],
    female: [
      'Agnes', 'Alva', 'Astrid', 'Ebba', 'Elin', 'Ellen', 'Emma', 'Freja', 'Hanna', 'Ida', 'Ingrid',
      'Julia', 'Klara', 'Linnea', 'Maja', 'Moa', 'Saga', 'Sofia', 'Tilda', 'Wilma', 'Frida',
      'Johanna', 'Matilda', 'Sara',
    ],
    surnames: [
      'Andersson', 'Bengtsson', 'Berg', 'Bergstrom', 'Bjork', 'Carlsson', 'Dahl', 'Eklund',
      'Ekstrom', 'Engstrom', 'Eriksson', 'Falk', 'Forsberg', 'Gustafsson', 'Hallberg', 'Hedlund',
      'Holm', 'Jonsson', 'Karlsson', 'Larsson', 'Lindberg', 'Lindqvist', 'Lundgren', 'Magnusson',
      'Nilsson', 'Nordin', 'Olsson', 'Persson', 'Sandberg', 'Sjoberg', 'Strom', 'Svensson',
      'Wallin', 'Axelsson', 'Blom', 'Ek', 'Isaksson', 'Johansson', 'Lindgren', 'Lundqvist',
      'Nyberg', 'Stromberg',
    ],
  },
  {
    nationality: 'Canada',
    weight: 35,
    male: [
      'Aiden', 'Blake', 'Brayden', 'Cameron', 'Chase', 'Cole', 'Connor', 'Dawson', 'Dylan', 'Ethan',
      'Gavin', 'Hayden', 'Hunter', 'Jaxon', 'Jesse', 'Keegan', 'Landon', 'Levi', 'Liam', 'Logan',
      'Mason', 'Nolan', 'Owen', 'Parker', 'Reid', 'Riley', 'Ryder', 'Spencer', 'Tanner', 'Tristan',
      'Carter', 'Colin', 'Derek', 'Etienne', 'Gabriel', 'Jean', 'Jonah', 'Kyle', 'Mathieu',
      'Patrick', 'Philippe', 'Ryan', 'Simon', 'Tyson', 'Wade',
    ],
    female: [
      'Abigail', 'Alexis', 'Avery', 'Brooke', 'Chloe', 'Ella', 'Emily', 'Hannah', 'Jade', 'Jordyn',
      'Kaitlyn', 'Lauren', 'Madison', 'Mackenzie', 'Maya', 'Nicole', 'Olivia', 'Paige', 'Sydney',
      'Taylor', 'Amelie', 'Audrey', 'Brittany', 'Camille', 'Danika', 'Genevieve', 'Jenna', 'Julie',
      'Kristen', 'Melanie', 'Natalie', 'Rachel', 'Sophie',
    ],
    surnames: [
      'Beaulieu', 'Bergeron', 'Bouchard', 'Boucher', 'Caron', 'Cloutier', 'Cote', 'Desjardins',
      'Fortin', 'Gagnon', 'Gauthier', 'Girard', 'Hebert', 'Lachance', 'Lafleur', 'Lambert',
      'Landry', 'Lavoie', 'Leblanc', 'Lefebvre', 'Levesque', 'Martel', 'Mercier', 'Morin', 'Nadeau',
      'Ouellet', 'Paquette', 'Pelletier', 'Poirier', 'Roy', 'Simard', 'Thibault', 'Tremblay',
      'Vachon', 'Belanger', 'Campbell', 'Fraser', 'Gill', 'Grant', 'MacDonald', 'MacLeod', 'Murphy',
      'Ouellette', 'Sandhu', 'Singh', 'Wong',
    ],
  },
  {
    nationality: 'Kazakhstan',
    surnameForm: 'russian',
    weight: 30,
    male: [
      'Adil', 'Aibek', 'Aidos', 'Alibek', 'Almas', 'Arman', 'Askar', 'Azamat', 'Bakhtiyar', 'Batyr',
      'Bekzat', 'Damir', 'Daniyar', 'Dias', 'Erlan', 'Kanat', 'Kuanysh', 'Marat', 'Miras', 'Nurlan',
      'Olzhas', 'Rustem', 'Sanzhar', 'Serik', 'Talgat', 'Temirlan', 'Yerbol', 'Yerlan', 'Zhandos',
      'Zhanibek', 'Abylai', 'Adilet', 'Aslan', 'Baurzhan', 'Dauren', 'Galym', 'Kairat', 'Ruslan',
      'Timur',
    ],
    female: [
      'Aigerim', 'Ainur', 'Aizhan', 'Akbota', 'Alua', 'Aruzhan', 'Assel', 'Bayan', 'Dana', 'Dinara',
      'Gulnara', 'Kamila', 'Madina', 'Nazgul', 'Saltanat', 'Zarina', 'Akmaral', 'Aliya', 'Asel',
      'Dariga', 'Saule', 'Togzhan', 'Zhuldyz',
    ],
    surnames: [
      'Abdrakhmanov', 'Akhmetov', 'Alimzhanov', 'Amangeldiev', 'Baimuratov', 'Bekturov', 'Dosanov',
      'Ergaliev', 'Ibragimov', 'Iskakov', 'Kabylov', 'Kaliyev', 'Karimov', 'Kenzhebaev',
      'Mukhamedov', 'Nurgaliev', 'Omarov', 'Rakhimov', 'Sadykov', 'Serikbayev', 'Suleimenov',
      'Tashkenov', 'Toleubayev', 'Turgunov', 'Yerzhanov', 'Zhaksylykov', 'Zhumabekov', 'Alimbekov',
      'Baimukhamedov', 'Bekov', 'Ermekov', 'Ibraev', 'Kairatov', 'Kassymov', 'Mukanov',
      'Nurmagambetov', 'Seitkali', 'Utepov', 'Yesimov', 'Zhakupov',
    ],
  },
  {
    nationality: 'Ireland',
    weight: 30,
    male: [
      'Aidan', 'Brendan', 'Cathal', 'Ciaran', 'Colm', 'Conor', 'Cormac', 'Darragh', 'Declan',
      'Diarmuid', 'Eoin', 'Fergal', 'Finbar', 'Gearoid', 'Kieran', 'Liam', 'Lorcan', 'Niall',
      'Oisin', 'Padraig', 'Ronan', 'Ruairi', 'Seamus', 'Sean', 'Shane', 'Tadhg', 'Turlough',
      'Eamon', 'Fintan', 'Cian', 'Cillian', 'Donal', 'Enda', 'Finn',
    ],
    female: [
      'Aine', 'Aisling', 'Aoife', 'Bridget', 'Caoimhe', 'Ciara', 'Clodagh', 'Eimear', 'Fiona',
      'Grainne', 'Maeve', 'Niamh', 'Orla', 'Roisin', 'Saoirse', 'Siobhan', 'Sinead', 'Ailbhe',
      'Deirdre', 'Una',
    ],
    surnames: [
      'Boyle', 'Brennan', 'Byrne', 'Cahill', 'Callaghan', 'Carroll', 'Casey', 'Clancy', 'Coyle',
      'Cullen', 'Daly', 'Donnelly', 'Doyle', 'Duffy', 'Dunne', 'Fitzgerald', 'Flanagan',
      'Gallagher', 'Hogan', 'Kavanagh', 'Keane', 'Kelly', 'Kennedy', 'Lynch', 'Maguire', 'Mahony',
      'Malone', 'McCarthy', 'Murphy', 'Nolan', 'Quinn', 'Rafferty', 'Reilly', 'Ryan', 'Sheridan',
      'Walsh', 'Cassidy', 'Connolly', 'Doherty', 'Farrell', 'Healy', 'MacCarthy', 'McGrath',
      'Moloney', 'O\'Brien', 'O\'Connor', 'O\'Donnell', 'O\'Neill', 'O\'Sullivan', 'Whelan',
    ],
  },
  {
    nationality: 'Netherlands',
    weight: 28,
    male: [
      'Bas', 'Bram', 'Daan', 'Dennis', 'Dirk', 'Erik', 'Floris', 'Gerard', 'Hendrik', 'Jelle',
      'Jeroen', 'Joost', 'Kees', 'Lars', 'Lucas', 'Maarten', 'Marco', 'Mark', 'Mees', 'Niels',
      'Pieter', 'Rens', 'Rick', 'Robin', 'Ruben', 'Sander', 'Sem', 'Sven', 'Thijs', 'Tim', 'Willem',
      'Wouter', 'Gijs', 'Jasper', 'Koen', 'Luuk', 'Milan', 'Rutger', 'Stijn',
    ],
    female: [
      'Anouk', 'Bo', 'Britt', 'Demi', 'Eva', 'Fleur', 'Iris', 'Jasmijn', 'Julia', 'Lieke', 'Lotte',
      'Maud', 'Merel', 'Nienke', 'Noa', 'Roos', 'Sanne', 'Sofie', 'Tess', 'Yara', 'Bente', 'Fenna',
      'Femke', 'Floor', 'Manon', 'Noor', 'Sophie',
    ],
    surnames: [
      'Bakker', 'Bos', 'Bosman', 'Brouwer', 'Dekker', 'Dijkstra', 'Groot', 'Hendriks', 'Hoekstra',
      'Jansen', 'Janssen', 'Klein', 'Kok', 'Koning', 'Kuiper', 'Meijer', 'Mulder', 'Peters', 'Post',
      'Prins', 'Schouten', 'Smit', 'Timmermans', 'Vermeulen', 'Visser', 'Vos', 'Willems', 'Wolters',
      'Zijlstra', 'de Boer', 'de Graaf', 'de Groot', 'de Jong', 'de Vries', 'Kramer', 'Smits',
      'van Dam', 'van den Berg', 'van der Linden', 'van Dijk', 'van Leeuwen',
    ],
  },
  {
    nationality: 'China',
    weight: 35,
    male: [
      'Bo', 'Chao', 'Cheng', 'Dawei', 'Feng', 'Gang', 'Hao', 'Jianguo', 'Jie', 'Jun', 'Kai', 'Lei',
      'Liang', 'Ming', 'Peng', 'Qiang', 'Rui', 'Sheng', 'Tao', 'Wei', 'Xiang', 'Xin', 'Yang',
      'Yong', 'Yu', 'Zhen', 'Zhi', 'Zhong', 'Bin', 'Fei', 'Haoran', 'Jian', 'Junjie', 'Wenbo',
      'Yuxuan', 'Zhiwei', 'Zihao',
    ],
    female: [
      'Fang', 'Hong', 'Hui', 'Jia', 'Jing', 'Juan', 'Lan', 'Li', 'Lian', 'Ling', 'Mei', 'Min', 'Na',
      'Ping', 'Qing', 'Rong', 'Xia', 'Xiu', 'Yan', 'Ying', 'Jiayi', 'Lili', 'Shuang', 'Ting',
      'Xiaoyan', 'Xinyi', 'Yue', 'Yun', 'Yutong',
    ],
    surnames: [
      'Cai', 'Cao', 'Chen', 'Deng', 'Ding', 'Feng', 'Gao', 'Guo', 'Han', 'He', 'Hu', 'Huang',
      'Jiang', 'Li', 'Lin', 'Liu', 'Luo', 'Ma', 'Pan', 'Peng', 'Qian', 'Song', 'Sun', 'Tang',
      'Wang', 'Wu', 'Xie', 'Xu', 'Yang', 'Ye', 'Yu', 'Zeng', 'Zhang', 'Zhao', 'Zheng', 'Zhou',
      'Zhu', 'Du', 'Fan', 'Liang', 'Lu', 'Wei', 'Yuan',
    ],
  },
  {
    nationality: 'Ukraine',
    surnameForm: 'ukrainian',
    weight: 28,
    male: [
      'Andriy', 'Bohdan', 'Danylo', 'Denys', 'Dmytro', 'Ihor', 'Ivan', 'Kostiantyn', 'Mykhailo',
      'Mykola', 'Nazar', 'Oleh', 'Oleksandr', 'Oleksiy', 'Ostap', 'Pavlo', 'Petro', 'Roman',
      'Ruslan', 'Serhiy', 'Stanislav', 'Taras', 'Vadym', 'Valentyn', 'Vasyl', 'Viktor', 'Vitaliy',
      'Volodymyr', 'Yaroslav', 'Yuriy', 'Artem', 'Maksym', 'Rostyslav', 'Stepan',
    ],
    female: [
      'Alina', 'Anastasiia', 'Bohdana', 'Daryna', 'Iryna', 'Kateryna', 'Khrystyna', 'Liliya',
      'Maryna', 'Nataliya', 'Oksana', 'Olena', 'Solomiya', 'Sofiya', 'Tetiana', 'Valeriya',
      'Viktoriya', 'Yuliya', 'Anastasiya', 'Halyna', 'Lesya', 'Mariya', 'Olha', 'Zoryana',
    ],
    surnames: [
      'Bondarenko', 'Boyko', 'Danylchenko', 'Fedorenko', 'Havrylenko', 'Hrytsenko', 'Kharchenko',
      'Klymenko', 'Kovalchuk', 'Kovalenko', 'Kravchenko', 'Lysenko', 'Marchenko', 'Melnyk', 'Moroz',
      'Onyshchenko', 'Petrenko', 'Polishchuk', 'Rudenko', 'Savchenko', 'Shevchenko', 'Sydorenko',
      'Tkachenko', 'Tymoshenko', 'Vasylenko', 'Yatsenko', 'Zakharchenko', 'Hnatyuk', 'Kozak',
      'Levchenko', 'Martynyuk', 'Oliynyk', 'Pavlenko', 'Romanyuk', 'Shevchuk', 'Tkachuk',
      'Zinchenko',
    ],
  },
  {
    nationality: 'Czechia',
    surnameForm: 'czech',
    weight: 24,
    male: [
      'Adam', 'Ales', 'David', 'Filip', 'Jakub', 'Jan', 'Jaroslav', 'Jiri', 'Josef', 'Karel',
      'Lukas', 'Marek', 'Martin', 'Michal', 'Milan', 'Ondrej', 'Patrik', 'Pavel', 'Petr', 'Radek',
      'Roman', 'Stanislav', 'Tomas', 'Vaclav', 'Vit', 'Vladimir', 'Vojtech', 'Zdenek', 'Daniel',
      'Dominik', 'Libor', 'Matej',
    ],
    female: [
      'Adela', 'Alena', 'Barbora', 'Eliska', 'Hana', 'Ivana', 'Jana', 'Karolina', 'Katerina',
      'Klara', 'Kristyna', 'Lenka', 'Lucie', 'Marketa', 'Martina', 'Michaela', 'Petra', 'Tereza',
      'Veronika', 'Zuzana', 'Denisa', 'Simona',
    ],
    surnames: [
      'Benes', 'Blazek', 'Cerny', 'Dolezal', 'Dvorak', 'Fiala', 'Hajek', 'Havel', 'Horak', 'Hruby',
      'Jelinek', 'Kolar', 'Kratochvil', 'Krejci', 'Kucera', 'Marek', 'Masek', 'Nemec', 'Novak',
      'Novotny', 'Pokorny', 'Pospisil', 'Prochazka', 'Ruzicka', 'Sedlacek', 'Simek', 'Sykora',
      'Urban', 'Vanek', 'Vesely', 'Zeman', 'Blaha', 'Cermak', 'Kopecky', 'Kral', 'Navratil',
      'Svoboda',
    ],
  },
  {
    nationality: 'Thailand',
    weight: 22,
    male: [
      'Anan', 'Anuwat', 'Chaiyaphum', 'Chatchai', 'Kiatisak', 'Krit', 'Narong', 'Nattapong',
      'Niran', 'Panya', 'Phichit', 'Pornchai', 'Prasert', 'Rungroj', 'Sakda', 'Samran', 'Sarawut',
      'Somchai', 'Somsak', 'Suchart', 'Sukhum', 'Sompong', 'Thanawat', 'Wichai', 'Worawut',
      'Yuttana', 'Anucha', 'Apichart', 'Chaiwat', 'Chakrit', 'Jakkrit', 'Kittisak', 'Komsan',
      'Pongsak', 'Sitthichai', 'Sombat', 'Suriya', 'Thanakorn', 'Weerapong', 'Yodsanan',
    ],
    female: [
      'Achara', 'Anong', 'Kanya', 'Lawan', 'Malee', 'Mali', 'Nari', 'Nittaya', 'Pensri', 'Ploy',
      'Ratana', 'Siriporn', 'Somsri', 'Sudarat', 'Thida', 'Wanida', 'Busaba', 'Duangjai',
      'Kanokwan', 'Pimchanok', 'Sukanya', 'Supaporn', 'Yupin',
    ],
    surnames: [
      'Boonmee', 'Charoen', 'Intharat', 'Jaidee', 'Kaewkla', 'Khunthong', 'Kittisak', 'Nakarin',
      'Nopparat', 'Phimchai', 'Phumipat', 'Prasert', 'Rattanakosin', 'Saetang', 'Sangthong',
      'Silapan', 'Sombat', 'Srisai', 'Suwannarat', 'Tangjai', 'Thepnakhon', 'Wongsawat', 'Yindee',
      'Chaisiri', 'Chaiyaporn', 'Inthanon', 'Khamsing', 'Kongkaew', 'Petchkasem', 'Phromsiri',
      'Rattanakorn', 'Saelim', 'Siriwat', 'Sitthikul', 'Srisuk', 'Thongchai', 'Yodsanit',
    ],
  },
  {
    nationality: 'Kyrgyzstan',
    surnameForm: 'russian',
    weight: 18,
    male: [
      'Aibek', 'Almaz', 'Azamat', 'Baktybek', 'Bekzat', 'Chyngyz', 'Daniyar', 'Emil', 'Erlan',
      'Ilim', 'Kanat', 'Kubanychbek', 'Maksat', 'Marat', 'Mirbek', 'Nurbek', 'Nursultan', 'Ruslan',
      'Sanjar', 'Taalai', 'Talant', 'Tilek', 'Ulan', 'Zamir', 'Adilet', 'Askat', 'Bakyt', 'Bektur',
      'Bolot', 'Erkin', 'Kanybek', 'Kubanych', 'Nurlan', 'Urmat',
    ],
    female: [
      'Aichurek', 'Aidai', 'Ainura', 'Aizada', 'Altynai', 'Begimai', 'Cholpon', 'Elmira', 'Gulnara',
      'Jyldyz', 'Meerim', 'Nurgul', 'Saltanat', 'Zarina', 'Asel', 'Elnura', 'Gulzat', 'Kanykei',
      'Nazira', 'Zhyldyz',
    ],
    surnames: [
      'Abdyldaev', 'Akmatov', 'Asanov', 'Bakirov', 'Beishenaliev', 'Duishenbek', 'Ismailov',
      'Jusupov', 'Kalykov', 'Karimov', 'Kasymov', 'Maratov', 'Nurlanov', 'Omurbekov', 'Sadyrbekov',
      'Sultanov', 'Tashiev', 'Toktogulov', 'Turdubekov', 'Usenov', 'Alymkulov', 'Dzhumabaev',
      'Isakov', 'Kalmatov', 'Mamatov', 'Mambetov', 'Nurmatov', 'Osmonov', 'Sydykov', 'Turdubaev',
      'Zhumaliev',
    ],
  },
  {
    nationality: 'Argentina',
    weight: 22,
    male: [
      'Agustin', 'Alejandro', 'Bruno', 'Cristian', 'Damian', 'Diego', 'Emiliano', 'Facundo',
      'Federico', 'Franco', 'Gaston', 'Gonzalo', 'Guillermo', 'Hernan', 'Ignacio', 'Joaquin',
      'Julian', 'Leandro', 'Lucas', 'Marcelo', 'Martin', 'Mateo', 'Matias', 'Nicolas', 'Pablo',
      'Ramiro', 'Rodrigo', 'Santiago', 'Sebastian', 'Tomas', 'Bautista', 'Ezequiel', 'Lisandro',
      'Marcos', 'Maximiliano', 'Nahuel', 'Valentin',
    ],
    female: [
      'Agustina', 'Camila', 'Candela', 'Carolina', 'Delfina', 'Florencia', 'Guadalupe', 'Julieta',
      'Lucia', 'Malena', 'Micaela', 'Milagros', 'Paula', 'Rocio', 'Sofia', 'Valentina', 'Victoria',
      'Ximena', 'Antonella', 'Belen', 'Luciana', 'Macarena',
    ],
    surnames: [
      'Acosta', 'Aguirre', 'Alvarez', 'Benitez', 'Bianchi', 'Cabrera', 'Cardozo', 'Castro',
      'Dominguez', 'Duarte', 'Fernandez', 'Ferrari', 'Gimenez', 'Gonzalez', 'Gutierrez', 'Ibarra',
      'Juarez', 'Ledesma', 'Luna', 'Medina', 'Molina', 'Moreno', 'Ortiz', 'Paredes', 'Peralta',
      'Quiroga', 'Rios', 'Rojas', 'Romero', 'Sosa', 'Suarez', 'Vega', 'Villalba', 'Cabral', 'Diaz',
      'Ferreyra', 'Godoy', 'Gomez', 'Herrera', 'Lopez', 'Martinez', 'Paz', 'Perez', 'Ponce',
      'Rodriguez', 'Ruiz', 'Torres',
    ],
  },
  {
    nationality: 'Cuba',
    weight: 16,
    male: [
      'Alejandro', 'Alexis', 'Ariel', 'Carlos', 'Dayron', 'Elier', 'Frank', 'Guillermo', 'Humberto',
      'Ivan', 'Javier', 'Jorge', 'Julio', 'Leonardo', 'Lazaro', 'Manuel', 'Michel', 'Orlando',
      'Osmany', 'Pedro', 'Rafael', 'Ramon', 'Reinier', 'Roberto', 'Rolando', 'Yoel', 'Yordan',
      'Yunior', 'Alain', 'Dariel', 'Leonel', 'Maikel', 'Raciel', 'Yandiel', 'Yasmany', 'Yoan',
      'Yoandry', 'Yordanis', 'Yosvany', 'Yuniel', 'Yunier',
    ],
    female: [
      'Aliuska', 'Anisleidys', 'Damaris', 'Dayana', 'Idalmis', 'Leidys', 'Maribel', 'Milaidys',
      'Odalys', 'Yaima', 'Yamila', 'Yanet', 'Yudith', 'Yusleidy', 'Arletis', 'Daylin', 'Lisandra',
      'Marisleidy', 'Mayelin', 'Yamile', 'Yenisey', 'Yusimi',
    ],
    surnames: [
      'Aguilera', 'Alonso', 'Baez', 'Blanco', 'Cabrera', 'Camacho', 'Cardenas', 'Castillo',
      'Cespedes', 'Delgado', 'Duarte', 'Estrada', 'Fuentes', 'Guerra', 'Herrera', 'Izquierdo',
      'Lastre', 'Machado', 'Mesa', 'Montano', 'Naranjo', 'Ordonez', 'Perez', 'Quesada', 'Rivero',
      'Rodriguez', 'Sarmiento', 'Tamayo', 'Valdes', 'Zamora', 'Alfonso', 'Alvarez', 'Arias',
      'Betancourt', 'Castellanos', 'Cruz', 'Despaigne', 'Echevarria', 'Fajardo', 'Garcia',
      'Hernandez', 'Leyva', 'Linares', 'Llanes', 'Marrero', 'Morales', 'Pupo', 'Ricardo', 'Sanchez',
      'Silva', 'Soto', 'Zayas',
    ],
  },
  {
    nationality: 'Germany',
    weight: 22,
    male: [
      'Alexander', 'Andreas', 'Ben', 'Christian', 'Daniel', 'Dennis', 'Dominik', 'Fabian', 'Felix',
      'Florian', 'Jan', 'Jonas', 'Julian', 'Kai', 'Lars', 'Leon', 'Lukas', 'Marcel', 'Marco',
      'Matthias', 'Max', 'Moritz', 'Niklas', 'Patrick', 'Philipp', 'Sascha', 'Sebastian', 'Stefan',
      'Thomas', 'Tim', 'Tobias',
    ],
    female: [
      'Anja', 'Annika', 'Carina', 'Franziska', 'Hannah', 'Jana', 'Johanna', 'Julia', 'Katharina',
      'Laura', 'Lea', 'Lena', 'Lisa', 'Marie', 'Melanie', 'Nina', 'Sabrina', 'Sandra', 'Sophie',
      'Vanessa',
    ],
    surnames: [
      'Bauer', 'Becker', 'Braun', 'Fischer', 'Frank', 'Hartmann', 'Hoffmann', 'Huber', 'Keller',
      'Klein', 'Koch', 'Kraus', 'Krause', 'Lange', 'Lehmann', 'Meyer', 'Muller', 'Neumann',
      'Richter', 'Schmidt', 'Schmitz', 'Schneider', 'Scholz', 'Schroder', 'Schulz', 'Schwarz',
      'Wagner', 'Weber', 'Werner', 'Wolf', 'Zimmermann',
    ],
  },
  {
    nationality: 'Spain',
    weight: 16,
    male: [
      'Adrian', 'Alberto', 'Alejandro', 'Alvaro', 'Antonio', 'Carlos', 'Daniel', 'David', 'Diego',
      'Eduardo', 'Enrique', 'Francisco', 'Hugo', 'Ignacio', 'Iker', 'Ivan', 'Javier', 'Jorge',
      'Juan', 'Luis', 'Manuel', 'Marcos', 'Mario', 'Miguel', 'Pablo', 'Pedro', 'Raul', 'Ruben',
      'Sergio', 'Victor',
    ],
    female: [
      'Alba', 'Ana', 'Andrea', 'Beatriz', 'Carla', 'Carmen', 'Claudia', 'Cristina', 'Elena',
      'Irene', 'Laura', 'Lucia', 'Maria', 'Marta', 'Nerea', 'Noelia', 'Paula', 'Raquel', 'Rocio',
      'Sara',
    ],
    surnames: [
      'Alonso', 'Blanco', 'Castro', 'Delgado', 'Diaz', 'Dominguez', 'Fernandez', 'Garcia', 'Gil',
      'Gomez', 'Gonzalez', 'Gutierrez', 'Hernandez', 'Iglesias', 'Jimenez', 'Lopez', 'Marin',
      'Martin', 'Martinez', 'Molina', 'Moreno', 'Munoz', 'Navarro', 'Ortega', 'Ramos', 'Romero',
      'Rubio', 'Ruiz', 'Sanchez', 'Santos', 'Serrano', 'Torres', 'Vazquez',
    ],
  },
  {
    nationality: 'Italy',
    weight: 14,
    male: [
      'Alessandro', 'Andrea', 'Antonio', 'Cristian', 'Daniele', 'Davide', 'Emanuele', 'Fabio',
      'Federico', 'Filippo', 'Francesco', 'Gabriele', 'Giacomo', 'Giovanni', 'Giuseppe', 'Leonardo',
      'Lorenzo', 'Luca', 'Marco', 'Matteo', 'Michele', 'Nicola', 'Paolo', 'Pietro', 'Riccardo',
      'Roberto', 'Salvatore', 'Simone', 'Stefano', 'Tommaso',
    ],
    female: [
      'Alessia', 'Anna', 'Beatrice', 'Chiara', 'Elena', 'Elisa', 'Federica', 'Francesca', 'Giada',
      'Giorgia', 'Giulia', 'Ilaria', 'Laura', 'Martina', 'Sara', 'Serena', 'Silvia', 'Valentina',
    ],
    surnames: [
      'De Luca', 'Barbieri', 'Bianchi', 'Bruno', 'Colombo', 'Conti', 'Costa', 'Esposito', 'Ferrari',
      'Ferri', 'Fontana', 'Galli', 'Gallo', 'Greco', 'Leone', 'Lombardi', 'Mancini', 'Marino',
      'Mariani', 'Martini', 'Moretti', 'Ricci', 'Rinaldi', 'Rizzo', 'Romano', 'Russo', 'Santoro',
      'Villa',
    ],
  },
  {
    nationality: 'New Zealand',
    weight: 14,
    male: [
      'Aaron', 'Angus', 'Blake', 'Brodie', 'Caleb', 'Connor', 'Daniel', 'Ethan', 'Finn', 'Hamish',
      'Jack', 'Jacob', 'James', 'Josh', 'Kane', 'Liam', 'Logan', 'Matiu', 'Nikau', 'Rawiri', 'Rhys',
      'Sam', 'Tama', 'Tane', 'Wiremu',
    ],
    female: [
      'Aroha', 'Ella', 'Georgia', 'Hana', 'Hine', 'Kiri', 'Maia', 'Mere', 'Olivia', 'Ruby',
      'Sophie', 'Tia', 'Wikitoria', 'Amelia', 'Charlotte',
    ],
    surnames: [
      'Anderson', 'Campbell', 'Clarke', 'Fraser', 'Grant', 'Harris', 'Henare', 'Hohaia', 'Kereama',
      'Mackay', 'McDonald', 'Ngata', 'Parata', 'Ruawai', 'Stewart', 'Tamihana', 'Taylor',
      'Thompson', 'Walker', 'Watson', 'Wilson', 'Wiremu', 'Young',
    ],
  },
  {
    nationality: 'Philippines',
    weight: 14,
    male: [
      'Aldrin', 'Angelo', 'Arnel', 'Benjie', 'Carlo', 'Christian', 'Danilo', 'Dennis', 'Edgar',
      'Eduardo', 'Jayson', 'Jerome', 'Jomar', 'Joshua', 'Kevin', 'Mark', 'Marlon', 'Michael',
      'Nestor', 'Paolo', 'Ramil', 'Renato', 'Rey', 'Rodel', 'Romeo', 'Ronald', 'Ryan',
    ],
    female: [
      'Angelica', 'Bea', 'Carmela', 'Charmaine', 'Cristina', 'Divina', 'Gemma', 'Jasmine', 'Joy',
      'Kristine', 'Leah', 'Lorna', 'Maricel', 'Princess', 'Rhea', 'Rowena',
    ],
    surnames: [
      'Dela Cruz', 'Aquino', 'Bautista', 'Castillo', 'Cruz', 'Domingo', 'Fernandez', 'Flores',
      'Garcia', 'Gonzales', 'Lopez', 'Manalo', 'Mendoza', 'Navarro', 'Ocampo', 'Pascual', 'Ramos',
      'Reyes', 'Rivera', 'Salazar', 'Santiago', 'Santos', 'Soriano', 'Tolentino', 'Torres',
      'Villanueva',
    ],
  },
  {
    nationality: 'Armenia',
    weight: 12,
    male: [
      'Aram', 'Aramayis', 'Armen', 'Arsen', 'Artur', 'Ashot', 'Davit', 'Edgar', 'Erik', 'Gagik',
      'Garik', 'Gevorg', 'Gor', 'Grigor', 'Hayk', 'Hovhannes', 'Karen', 'Levon', 'Mher', 'Narek',
      'Samvel', 'Sargis', 'Tigran', 'Vahe', 'Vardan', 'Vazgen',
    ],
    female: [
      'Anahit', 'Ani', 'Anush', 'Arpi', 'Astghik', 'Gayane', 'Hasmik', 'Lilit', 'Mariam', 'Mane',
      'Nare', 'Sona', 'Tatev', 'Zara',
    ],
    surnames: [
      'Avetisyan', 'Babayan', 'Gasparyan', 'Ghazaryan', 'Grigoryan', 'Hakobyan', 'Harutyunyan',
      'Hovhannisyan', 'Karapetyan', 'Khachatryan', 'Manukyan', 'Martirosyan', 'Mkrtchyan',
      'Petrosyan', 'Poghosyan', 'Sargsyan', 'Simonyan', 'Stepanyan', 'Tadevosyan', 'Vardanyan',
    ],
  },
  {
    nationality: 'Azerbaijan',
    surnameForm: 'russian',
    weight: 12,
    male: [
      'Agil', 'Anar', 'Aydin', 'Elchin', 'Elnur', 'Elvin', 'Emin', 'Farid', 'Fuad', 'Huseyn',
      'Ilkin', 'Kamran', 'Murad', 'Nijat', 'Orkhan', 'Ramil', 'Rashad', 'Rauf', 'Rufat', 'Samir',
      'Tural', 'Vugar', 'Yusif', 'Zaur',
    ],
    female: [
      'Aygun', 'Aynur', 'Gunay', 'Gulnar', 'Kamala', 'Lala', 'Leyla', 'Nargiz', 'Nigar', 'Sabina',
      'Sevinj', 'Turkan', 'Ulviyya',
    ],
    surnames: [
      'Abbasov', 'Agayev', 'Aliyev', 'Babayev', 'Bagirov', 'Gasimov', 'Guliyev', 'Hasanov',
      'Huseynov', 'Ibrahimov', 'Ismayilov', 'Jafarov', 'Karimov', 'Mammadov', 'Mehdiyev',
      'Mustafayev', 'Nasirov', 'Novruzov', 'Rzayev', 'Valiyev',
    ],
  },
  {
    nationality: 'Mongolia',
    weight: 10,
    male: [
      'Altangerel', 'Ariunbold', 'Batbayar', 'Batbold', 'Batkhuyag', 'Battulga', 'Bilguun',
      'Byambadorj', 'Dorjsuren', 'Enkhbold', 'Erdene', 'Ganbaatar', 'Ganzorig', 'Khurelbaatar',
      'Munkhbat', 'Nyamdorj', 'Otgonbayar', 'Sukhbaatar', 'Temuulen', 'Tsogtbaatar',
    ],
    female: [
      'Anujin', 'Ariuntsetseg', 'Bolormaa', 'Enkhjargal', 'Khulan', 'Munkhzul', 'Narantuya',
      'Nomin', 'Oyunchimeg', 'Sarangerel', 'Solongo', 'Tsetsegmaa', 'Uranchimeg', 'Zolzaya',
    ],
    surnames: [
      'Altankhuyag', 'Amarsaikhan', 'Batsaikhan', 'Bayarsaikhan', 'Byambasuren', 'Chuluunbaatar',
      'Dashdorj', 'Enkhtuvshin', 'Erdenebat', 'Gantulga', 'Jargalsaikhan', 'Lkhagvasuren',
      'Naranbaatar', 'Ochirbat', 'Purevdorj', 'Sainbayar', 'Tumenbayar', 'Unurbat',
    ],
  },
  {
    nationality: 'Uzbekistan',
    surnameForm: 'russian',
    weight: 12,
    male: [
      'Akmal', 'Alisher', 'Aziz', 'Bakhodir', 'Bekzod', 'Dilshod', 'Doniyor', 'Farrukh', 'Firdavs',
      'Jahongir', 'Jasur', 'Khurshid', 'Mirzo', 'Murod', 'Nodir', 'Otabek', 'Ravshan', 'Rustam',
      'Sanjar', 'Sardor', 'Sherzod', 'Shokhrukh', 'Timur', 'Ulugbek',
    ],
    female: [
      'Dilnoza', 'Dildora', 'Feruza', 'Gulnora', 'Kamola', 'Lola', 'Madina', 'Malika', 'Mohira',
      'Nargiza', 'Nilufar', 'Sevara', 'Shahnoza', 'Umida', 'Zilola',
    ],
    surnames: [
      'Abdullaev', 'Akhmedov', 'Alimov', 'Azimov', 'Ergashev', 'Ismoilov', 'Juraev', 'Karimov',
      'Khamidov', 'Mirzaev', 'Nazarov', 'Rakhimov', 'Rasulov', 'Saidov', 'Salimov', 'Tashkentov',
      'Umarov', 'Usmonov', 'Yuldashev', 'Zakirov',
    ],
  },
  {
    nationality: 'Turkey',
    weight: 12,
    male: [
      'Ahmet', 'Ali', 'Arda', 'Berk', 'Burak', 'Can', 'Cem', 'Efe', 'Emre', 'Enes', 'Eren',
      'Furkan', 'Hakan', 'Halil', 'Hasan', 'Kaan', 'Kerem', 'Mehmet', 'Murat', 'Mustafa', 'Oguz',
      'Onur', 'Serkan', 'Tolga', 'Umut', 'Volkan', 'Yusuf',
    ],
    female: [
      'Asli', 'Aylin', 'Ayse', 'Busra', 'Cansu', 'Derya', 'Ebru', 'Elif', 'Esra', 'Gizem', 'Merve',
      'Ozge', 'Selin', 'Sibel', 'Tugba', 'Zeynep',
    ],
    surnames: [
      'Acar', 'Akin', 'Arslan', 'Aslan', 'Aydin', 'Bulut', 'Cakir', 'Celik', 'Demir', 'Dogan',
      'Erdem', 'Guler', 'Kaplan', 'Kara', 'Kaya', 'Keskin', 'Koc', 'Kurt', 'Ozdemir', 'Ozturk',
      'Polat', 'Sahin', 'Sen', 'Tekin', 'Unal', 'Yavuz', 'Yildirim', 'Yildiz', 'Yilmaz',
    ],
  },
  {
    nationality: 'Chile',
    weight: 8,
    male: [
      'Alexis', 'Benjamin', 'Bastian', 'Claudio', 'Cristobal', 'Diego', 'Esteban', 'Felipe',
      'Fernando', 'Gonzalo', 'Ignacio', 'Javier', 'Joaquin', 'Jorge', 'Matias', 'Maximiliano',
      'Nicolas', 'Patricio', 'Rodrigo', 'Sebastian', 'Tomas', 'Vicente',
    ],
    female: [
      'Antonia', 'Catalina', 'Constanza', 'Daniela', 'Fernanda', 'Francisca', 'Javiera', 'Josefa',
      'Macarena', 'Paula', 'Trinidad', 'Valentina',
    ],
    surnames: [
      'Araya', 'Bravo', 'Carrasco', 'Contreras', 'Espinoza', 'Fuentes', 'Gonzalez', 'Henriquez',
      'Morales', 'Munoz', 'Nunez', 'Pizarro', 'Reyes', 'Rojas', 'Saavedra', 'Sepulveda', 'Soto',
      'Tapia', 'Valenzuela', 'Vergara', 'Zuniga',
    ],
  },
  {
    nationality: 'South Africa',
    weight: 10,
    male: [
      'Andile', 'Bongani', 'Caleb', 'Cornelius', 'Dewald', 'Dumisani', 'Ettienne', 'Francois',
      'Hendrik', 'Jaco', 'Johan', 'Kagiso', 'Lungile', 'Mandla', 'Pieter', 'Ruan', 'Sibusiso',
      'Sipho', 'Thabo', 'Themba', 'Tumelo', 'Wian', 'Zola',
    ],
    female: [
      'Anele', 'Busisiwe', 'Chantelle', 'Elmarie', 'Karabo', 'Lerato', 'Lindiwe', 'Mpho', 'Naledi',
      'Nomvula', 'Refilwe', 'Riana', 'Thandiwe', 'Zanele',
    ],
    surnames: [
      'du Plessis', 'du Toit', 'van der Merwe', 'van Wyk', 'Botha', 'Coetzee', 'Dlamini',
      'Ferreira', 'Khumalo', 'Kruger', 'Mahlangu', 'Mokoena', 'Ndlovu', 'Nel', 'Nkosi', 'Pretorius',
      'Smit', 'Steyn', 'Venter', 'Zulu',
    ],
  },
  {
    nationality: 'Cameroon',
    weight: 8,
    male: [
      'Alain', 'Armand', 'Blaise', 'Christian', 'Emmanuel', 'Eric', 'Francis', 'Herve', 'Jean',
      'Joel', 'Landry', 'Moise', 'Patrice', 'Rigobert', 'Roger', 'Serge', 'Stephane', 'Thierry',
      'Vincent', 'Yannick',
    ],
    female: [
      'Aminatou', 'Brigitte', 'Carine', 'Christelle', 'Clarisse', 'Esther', 'Francoise', 'Josiane',
      'Mireille', 'Nadege', 'Pauline', 'Sandrine',
    ],
    surnames: [
      'Abega', 'Atangana', 'Ayissi', 'Bekono', 'Ebanda', 'Essomba', 'Fotso', 'Kamga', 'Manga',
      'Mbarga', 'Mbia', 'Ndjock', 'Ngono', 'Njoya', 'Nkoulou', 'Owona', 'Tchakounte', 'Tchoumi',
    ],
  },
  {
    nationality: 'Scotland',
    weight: 12,
    male: [
      'Alasdair', 'Andrew', 'Callum', 'Calum', 'Craig', 'Duncan', 'Ewan', 'Fraser', 'Gavin',
      'Graeme', 'Hamish', 'Iain', 'Jamie', 'Kenny', 'Lewis', 'Lachlan', 'Malcolm', 'Murray', 'Neil',
      'Ross', 'Rory', 'Scott', 'Stuart', 'Struan',
    ],
    female: [
      'Ailsa', 'Catriona', 'Eilidh', 'Fiona', 'Iona', 'Isla', 'Kirsty', 'Lorna', 'Mhairi', 'Morag',
      'Rhona', 'Shona', 'Skye',
    ],
    surnames: [
      'Anderson', 'Buchanan', 'Cameron', 'Campbell', 'Douglas', 'Ferguson', 'Forbes', 'Fraser',
      'Gordon', 'Grant', 'Henderson', 'Kerr', 'MacDonald', 'MacKay', 'MacKenzie', 'MacLean',
      'MacLeod', 'McGregor', 'Munro', 'Murray', 'Reid', 'Robertson', 'Ross', 'Sinclair', 'Stewart',
      'Wallace',
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
  const firstName = rng.pick(given);
  const drawn = rng.pick(pool.surnames);
  const surname = drawn === firstName ? nextSurname(pool, drawn) : drawn;

  return {
    firstName,
    lastName: sex === 'female' ? feminineSurname(surname, pool.surnameForm) : surname,
    // The requested nationality wins even when there is no pool for it, so a caller can seed a
    // country this table does not cover without the fighter being silently relocated.
    nationality: nationality ?? pool.nationality,
  };
}

/**
 * The neighbouring surname, for the one draw that would otherwise read as a typo.
 *
 * Several pools carry a word as both a given name and a surname (`Preston`, `Marcus`), so two
 * independent draws produced a Preston Preston about once in a thousand fighters — rare, and the
 * first thing anybody notices on a roster screen. Stepping to the neighbour rather than redrawing
 * keeps the stream's draw count fixed, so no other fighter in the world changes because of it.
 */
function nextSurname(pool: NamePool, drawn: string): string {
  const at = pool.surnames.indexOf(drawn);
  return pool.surnames[(at + 1) % pool.surnames.length]!;
}

/**
 * A stored (masculine) surname as a woman carries it.
 *
 * The rules are the regular ones; the table only holds surnames they handle. Names they leave
 * alone — Ukrainian -enko and -uk, Georgian -shvili, a Kazakh -kali — are unchanged in both forms,
 * which is correct for those languages rather than a gap in the rule.
 */
export function feminineSurname(surname: string, form: SurnameForm | undefined): string {
  switch (form) {
    case undefined:
      return surname;
    case 'russian':
    case 'ukrainian':
      // Kovalsky is Kovalskaya in Russian and Kovalska in Ukrainian.
      if (/(sky|skiy|skyi)$/.test(surname))
        return surname.replace(/(sky|skiy|skyi)$/, form === 'russian' ? 'skaya' : 'ska');
      if (/(ov|ev|yov|in|yn)$/.test(surname)) return `${surname}a`;
      return surname;
    case 'polish':
      return surname.replace(/(ski|cki|dzki)$/, (end) => `${end.slice(0, -1)}a`);
    case 'czech':
      if (/y$/.test(surname)) return surname.replace(/y$/, 'a');
      if (/i$/.test(surname)) return surname;
      if (/a$/.test(surname)) return `${surname.slice(0, -1)}ova`;
      if (/ek$/.test(surname)) return `${surname.slice(0, -2)}kova`;
      if (/ec$/.test(surname)) return `${surname.slice(0, -2)}cova`;
      return `${surname}ova`;
  }
}
