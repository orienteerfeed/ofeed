interface Competitor {
  firstname: string;
  lastname: string;
}

interface CompetitorNameProps {
  competitor: Competitor;
}

export const CompetitorName = ({ competitor }: CompetitorNameProps) => {
  const firstname = competitor.firstname?.trim() ?? '';
  const lastname = competitor.lastname?.trim() ?? '';
  const hasLastname = lastname.length > 0;

  return (
    <>
      <span className="block sm:hidden">
        {hasLastname ? `${lastname} ${firstname.charAt(0)}.` : firstname}
      </span>
      <span className="hidden sm:block">
        {hasLastname ? `${lastname} ${firstname}` : firstname}
      </span>
    </>
  );
};
