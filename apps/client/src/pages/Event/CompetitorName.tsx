interface Competitor {
  firstname: string;
  lastname: string;
}

interface CompetitorNameProps {
  competitor: Competitor;
}

export const getMobileCompetitorName = (competitor: Competitor): string => {
  const firstname = competitor.firstname?.trim() ?? '';
  const lastname = competitor.lastname?.trim() ?? '';

  return lastname.length > 0
    ? `${lastname} ${firstname.charAt(0)}.`
    : firstname;
};

export const CompetitorName = ({ competitor }: CompetitorNameProps) => {
  const firstname = competitor.firstname?.trim() ?? '';
  const lastname = competitor.lastname?.trim() ?? '';
  const hasLastname = lastname.length > 0;

  return (
    <>
      <span className="block sm:hidden">
        {getMobileCompetitorName(competitor)}
      </span>
      <span className="hidden sm:block">
        {hasLastname ? `${lastname} ${firstname}` : firstname}
      </span>
    </>
  );
};
